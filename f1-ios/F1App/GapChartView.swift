import SwiftUI
import Charts
import F1Core

struct GapPoint: Identifiable {
    let lap: Int
    let gap: Double
    var id: Int { lap }
}

struct GapSeries: Identifiable {
    let driver: Int
    let code: String
    let color: Color
    let points: [GapPoint]
    var id: Int { driver }
}

struct GapChartData {
    let series: [GapSeries]
    let periods: [CautionPeriod]
    let maxGap: Double
}

@MainActor
final class GapChartViewModel: ObservableObject {
    @Published var state: LoadState<GapChartData> = .idle

    func load(sessionKey: Int) async {
        state = .loading
        do {
            let client = OpenF1Client.shared
            async let laps = client.laps(sessionKey: sessionKey)
            async let drivers = client.drivers(sessionKey: sessionKey)
            async let control = client.raceControl(sessionKey: sessionKey)
            state = .loaded(Self.build(
                laps: try await laps, drivers: try await drivers, raceControl: try await control))
        } catch {
            if !Task.isCancelled { state = .failed(error.localizedDescription) }
        }
    }

    /// Top 8 finishers' gap to the leader per lap, plus Safety Car / VSC periods.
    static func build(laps: [Lap], drivers: [Driver], raceControl: [RaceControlMessage]) -> GapChartData {
        let timing = RaceTiming(laps: laps)
        let gaps = timing.gapToLeader()
        let driverMap = Dictionary(drivers.map { ($0.driverNumber, $0) }, uniquingKeysWith: { first, _ in first })

        // Order by classification: most laps completed first, then lowest total time.
        func finish(_ driver: Int) -> (lap: Int, time: Double) {
            guard let byLap = timing.cumulative[driver], let last = byLap.keys.max() else { return (0, .infinity) }
            return (last, byLap[last] ?? .infinity)
        }
        let ordered = timing.driverNumbers.sorted { a, b in
            let fa = finish(a), fb = finish(b)
            return fa.lap != fb.lap ? fa.lap > fb.lap : fa.time < fb.time
        }

        var maxGap = 1.0
        let series: [GapSeries] = ordered.prefix(8).map { number in
            let byLap = gaps[number] ?? [:]
            let points = byLap.keys.sorted().map { GapPoint(lap: $0, gap: byLap[$0] ?? 0) }
            if let largest = points.map(\.gap).max() { maxGap = max(maxGap, largest) }
            let driver = driverMap[number]
            return GapSeries(
                driver: number,
                code: driver?.nameAcronym ?? "#\(number)",
                color: Color(teamHex: driver?.teamColour),
                points: points
            )
        }
        return GapChartData(
            series: series,
            periods: safetyCarPeriods(raceControl, maxLap: timing.maxLap),
            maxGap: maxGap
        )
    }
}

struct GapChartView: View {
    let sessionKey: Int?
    @StateObject private var model = GapChartViewModel()

    var body: some View {
        Group {
            if sessionKey == nil {
                Text("Select a race").foregroundStyle(.secondary)
            } else {
                LoadStateView(model.state) { data in
                    if data.series.isEmpty {
                        Text("No lap data for this session.").foregroundStyle(.secondary).padding()
                    } else {
                        ScrollView {
                            VStack(alignment: .leading, spacing: 12) {
                                chart(data)
                                    .frame(height: 320)
                                Text(footnote(data))
                                    .font(.footnote).foregroundStyle(.secondary)
                            }
                            .padding()
                        }
                    }
                }
            }
        }
        .navigationTitle("Gap to Leader")
        .task(id: sessionKey) {
            guard let sessionKey else { return }
            await model.load(sessionKey: sessionKey)
        }
    }

    private func chart(_ data: GapChartData) -> some View {
        Chart {
            // Safety Car (gold) and VSC (blue) bands behind the lines.
            ForEach(data.periods, id: \.self) { period in
                RectangleMark(
                    xStart: .value("From", period.start),
                    xEnd: .value("To", period.end),
                    yStart: .value("Min", 0.0),
                    yEnd: .value("Max", data.maxGap)
                )
                .foregroundStyle((period.type == .sc ? Color.yellow : Color.blue).opacity(0.18))
            }
            ForEach(data.series) { series in
                ForEach(series.points) { point in
                    LineMark(
                        x: .value("Lap", point.lap),
                        y: .value("Gap (s)", point.gap),
                        series: .value("Driver", series.code)
                    )
                    .foregroundStyle(series.color)
                }
            }
        }
        .chartXAxisLabel("Lap")
        .chartYAxisLabel("Gap to leader (s)")
    }

    private func footnote(_ data: GapChartData) -> String {
        let drivers = data.series.map(\.code).joined(separator: ", ")
        var text = "Top finishers: \(drivers). Cumulative gap to the race leader at each lap."
        if !data.periods.isEmpty { text += " Shaded bands mark Safety Car (gold) and Virtual Safety Car (blue) periods." }
        return text
    }
}
