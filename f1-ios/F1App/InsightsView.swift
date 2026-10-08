import SwiftUI
import Charts
import F1Core

struct CircuitData {
    let summary: CircuitSummary
    let location: String
    let failedRaces: Int
}

struct LeaderboardData {
    let rows: [LeaderboardRow]
    let races: Int
    let failedRaces: Int
}

/// Both views here load many races (about four requests each), so nothing is
/// fetched until the user asks.
@MainActor
final class InsightsViewModel: ObservableObject {
    @Published var circuit: LoadState<CircuitData> = .idle
    @Published var leaderboard: LoadState<LeaderboardData> = .idle
    @Published var progress: (done: Int, total: Int) = (0, 0)

    func resetCircuit() { circuit = .idle }
    func resetLeaderboard() { leaderboard = .idle }

    private func report(_ done: Int, _ total: Int) { progress = (done, total) }

    func loadCircuit(location: String) async {
        circuit = .loading
        progress = (0, 0)
        do {
            let client = OpenF1Client.shared
            let sessions = try await client.raceSessions(atLocation: location)
            guard !sessions.isEmpty else {
                circuit = .failed("No races found at \(location).")
                return
            }
            let yearByKey = Dictionary(sessions.map { ($0.sessionKey, $0.year ?? 0) }, uniquingKeysWith: { first, _ in first })
            let batch = try await client.overtakeBatch(sessionKeys: sessions.map(\.sessionKey)) { [weak self] done, total in
                Task { @MainActor in self?.report(done, total) }
            }

            let years = batch.results.map { key, result in
                YearOvertakes(year: yearByKey[key] ?? 0, overtakes: result.overtakes)
            }
            guard let summary = OvertakeStats.circuitSummary(years) else {
                circuit = .failed("Couldn't load any races at \(location).")
                return
            }
            circuit = .loaded(CircuitData(summary: summary, location: location, failedRaces: batch.failedKeys.count))
        } catch {
            if !Task.isCancelled { circuit = .failed(error.localizedDescription) }
        }
    }

    func loadLeaderboard(year: Int) async {
        leaderboard = .loading
        progress = (0, 0)
        do {
            let client = OpenF1Client.shared
            let sessions = try await client.raceAndSprintSessions(year: year)
            // Main races only: a sprint's few passes would skew a season tally.
            let keys = Rounds.build(sessions: sessions).map(\.raceKey)
            guard !keys.isEmpty else {
                leaderboard = .failed("No completed races found for \(year).")
                return
            }
            let batch = try await client.overtakeBatch(sessionKeys: keys) { [weak self] done, total in
                Task { @MainActor in self?.report(done, total) }
            }
            guard !batch.results.isEmpty else {
                leaderboard = .failed("Couldn't load any \(year) races.")
                return
            }
            leaderboard = .loaded(LeaderboardData(
                rows: OvertakeStats.leaderboard(Array(batch.results.values)),
                races: batch.results.count,
                failedRaces: batch.failedKeys.count))
        } catch {
            if !Task.isCancelled { leaderboard = .failed(error.localizedDescription) }
        }
    }
}

struct InsightsView: View {
    let round: Round?
    let year: Int
    @StateObject private var model = InsightsViewModel()
    @State private var mode: Mode = .circuit
    @State private var sort: Sort = .made

    enum Mode: String, CaseIterable, Identifiable {
        case circuit = "Circuit History"
        case leaderboard = "Season Leaderboard"
        var id: String { rawValue }
    }

    enum Sort: String, CaseIterable, Identifiable {
        case made = "Made", suffered = "Suffered", net = "Net"
        var id: String { rawValue }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Picker("View", selection: $mode) {
                    ForEach(Mode.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)

                switch mode {
                case .circuit: circuitSection
                case .leaderboard: leaderboardSection
                }
            }
            .padding()
        }
        .navigationTitle("Insights")
        .task(id: round?.location) { model.resetCircuit() }
        .task(id: year) { model.resetLeaderboard() }
    }

    // MARK: Circuit history

    @ViewBuilder
    private var circuitSection: some View {
        if let location = round?.location {
            switch model.circuit {
            case .idle:
                loadPrompt(
                    "Aggregate every Grand Prix held at \(location) to find the pace advantage typically needed to complete a pass there.",
                    button: "Load circuit history") {
                    Task { await model.loadCircuit(location: location) }
                }
            case .loading:
                progressView
            case .failed(let message):
                failureView(message) { Task { await model.loadCircuit(location: location) } }
            case .loaded(let data):
                circuitResults(data)
            }
        } else {
            Text("Select a race").foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func circuitResults(_ data: CircuitData) -> some View {
        let summary = data.summary
        HStack {
            stat("\(summary.races)", "Races")
            stat("\(summary.totalOvertakes)", "Overtakes")
            stat(summary.medianAdvantage.map { String(format: "%.2fs", $0) } ?? "—", "Median advantage", color: .green)
            stat(summary.meanAdvantage.map { String(format: "%.2fs", $0) } ?? "—", "Mean advantage")
        }
        Chart(summary.buckets) { bucket in
            BarMark(x: .value("Pace advantage", bucket.label), y: .value("Overtakes", bucket.count))
                .foregroundStyle(Color.green)
        }
        .frame(height: 180)

        ScrollView(.horizontal, showsIndicators: false) {
            HStack {
                ForEach(summary.perYear) { entry in
                    Text("\(String(entry.year)): \(entry.count)")
                        .font(.caption)
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(Color.gray.opacity(0.15))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }
            }
        }

        footnote(circuitNote(data, summary), warn: data.failedRaces > 0)
    }

    // MARK: Season leaderboard

    @ViewBuilder
    private var leaderboardSection: some View {
        switch model.leaderboard {
        case .idle:
            loadPrompt(
                "Run overtake detection across every \(String(year)) race to rank drivers by passes made and suffered.",
                button: "Load \(String(year)) season") {
                Task { await model.loadLeaderboard(year: year) }
            }
        case .loading:
            progressView
        case .failed(let message):
            failureView(message) { Task { await model.loadLeaderboard(year: year) } }
        case .loaded(let data):
            leaderboardResults(data)
        }
    }

    @ViewBuilder
    private func leaderboardResults(_ data: LeaderboardData) -> some View {
        Picker("Sort", selection: $sort) {
            ForEach(Sort.allCases) { Text($0.rawValue).tag($0) }
        }
        .pickerStyle(.segmented)

        let rows = data.rows.sorted { a, b in
            switch sort {
            case .made: return a.made != b.made ? a.made > b.made : a.driverNumber < b.driverNumber
            case .suffered: return a.suffered != b.suffered ? a.suffered > b.suffered : a.driverNumber < b.driverNumber
            case .net: return a.net != b.net ? a.net > b.net : a.driverNumber < b.driverNumber
            }
        }
        VStack(spacing: 0) {
            ForEach(rows.indices, id: \.self) { index in
                let row = rows[index]
                HStack {
                    Text("\(index + 1)").font(.caption).foregroundStyle(.secondary).frame(width: 28, alignment: .leading)
                    Text(row.driver?.nameAcronym ?? "#\(row.driverNumber)")
                        .fontWeight(.bold).foregroundStyle(Color(teamHex: row.driver?.teamColour))
                    Spacer()
                    Text("\(row.made)").foregroundStyle(Color.green).frame(width: 44, alignment: .trailing)
                    Text("\(row.suffered)").foregroundStyle(Color.red).frame(width: 44, alignment: .trailing)
                    Text(String(format: "%+ld", row.net))
                        .foregroundStyle(row.net > 0 ? Color.green : (row.net < 0 ? Color.red : Color.secondary))
                        .frame(width: 44, alignment: .trailing)
                }
                .monospacedDigit()
                .padding(.vertical, 6)
                Divider()
            }
        }
        footnote(leaderboardNote(data), warn: data.failedRaces > 0)
    }

    // MARK: Footnotes

    private func footnote(_ text: String, warn: Bool) -> some View {
        Text(text).font(.footnote).foregroundStyle(warn ? Color.orange : Color.secondary)
    }

    private func circuitNote(_ data: CircuitData, _ summary: CircuitSummary) -> String {
        var note = "Based on \(summary.cleanCount) pass\(summary.cleanCount == 1 ? "" : "es") where the attacker's lap was faster."
        if summary.oddCount > 0 {
            note += " \(summary.oddCount) more happened despite a slower lap overall and are excluded."
        }
        if data.failedRaces > 0 {
            note += " \(data.failedRaces) race\(data.failedRaces == 1 ? "" : "s") couldn't be loaded, so this sample is incomplete."
        }
        return note
    }

    private func leaderboardNote(_ data: LeaderboardData) -> String {
        var note = "Passes made vs. suffered across \(data.races) race\(data.races == 1 ? "" : "s"). Columns: made, suffered, net. Pit-stop and Safety Car position changes are excluded."
        if data.failedRaces > 0 {
            note += " \(data.failedRaces) race\(data.failedRaces == 1 ? "" : "s") couldn't be loaded, so totals are incomplete."
        }
        return note
    }

    // MARK: Shared pieces

    private var progressView: some View {
        VStack(spacing: 8) {
            ProgressView()
            if model.progress.total > 0 {
                Text("Loaded \(model.progress.done) of \(model.progress.total) races…")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 140)
    }

    private func loadPrompt(_ text: String, button: String, action: @escaping () -> Void) -> some View {
        VStack(spacing: 12) {
            Text(text).font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
            Button(button, action: action).buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, minHeight: 140)
    }

    private func failureView(_ message: String, retry: @escaping () -> Void) -> some View {
        VStack(spacing: 10) {
            Text(message).foregroundStyle(Color.red).multilineTextAlignment(.center)
            Button("Retry", action: retry).buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, minHeight: 120)
    }

    private func stat(_ value: String, _ label: String, color: Color = .primary) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.title3.bold()).foregroundStyle(color)
            Text(label).font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }
}
