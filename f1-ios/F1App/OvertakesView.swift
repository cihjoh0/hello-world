import SwiftUI
import F1Core

@MainActor
final class OvertakesViewModel: ObservableObject {
    @Published var state: LoadState<OvertakeResult> = .idle

    func load(sessionKey: Int) async {
        state = .loading
        do {
            let client = OpenF1Client.shared
            async let drivers = client.drivers(sessionKey: sessionKey)
            async let laps = client.laps(sessionKey: sessionKey)
            async let pits = client.pitStops(sessionKey: sessionKey)
            async let control = client.raceControl(sessionKey: sessionKey)
            let result = Overtakes.detect(
                drivers: try await drivers,
                laps: try await laps,
                pitStops: try await pits,
                raceControl: try await control
            )
            state = .loaded(result)
        } catch {
            if !Task.isCancelled { state = .failed(error.localizedDescription) }
        }
    }
}

struct OvertakesView: View {
    let sessionKey: Int?
    @StateObject private var model = OvertakesViewModel()

    var body: some View {
        Group {
            if sessionKey == nil {
                Text("Select a race").foregroundStyle(.secondary)
            } else {
                LoadStateView(model.state) { result in
                    if result.overtakes.isEmpty {
                        Text("No on-track overtakes detected for this session.")
                            .foregroundStyle(.secondary)
                            .padding()
                    } else {
                        List {
                            Section {
                                summaryRow(result)
                            }
                            Section("Passes") {
                                ForEach(result.overtakes) { pass in
                                    row(pass, drivers: result.driverMap)
                                }
                            }
                            Section {
                                Text("Detected by comparing driver rank lap-over-lap. Pit in/out laps, Safety Car laps and lap 1 are excluded. Pace is the attacker's lap time minus the defender's on the pass lap (negative = attacker faster).")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Overtakes")
        .task(id: sessionKey) {
            guard let sessionKey else { return }
            await model.load(sessionKey: sessionKey)
        }
    }

    private func summaryRow(_ result: OvertakeResult) -> some View {
        let deltas = result.overtakes.map(\.paceDelta)
        let average = deltas.reduce(0, +) / Double(deltas.count)
        return HStack {
            VStack(alignment: .leading) {
                Text("\(result.overtakes.count)").font(.title.bold())
                Text("Overtakes").font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing) {
                Text(String(format: "%.2fs", average)).font(.title.bold()).foregroundStyle(Color.green)
                Text("Avg pace vs defender").font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func row(_ pass: Overtake, drivers: [Int: Driver]) -> some View {
        HStack {
            Text("L\(pass.lap)").font(.caption).foregroundStyle(.secondary).frame(width: 36, alignment: .leading)
            tag(pass.attacker, drivers)
            Text("past").font(.caption).foregroundStyle(.secondary)
            tag(pass.defender, drivers)
            Spacer()
            Text("P\(pass.posAfter)").foregroundStyle(.secondary)
            Text(String(format: "%+.2fs", pass.paceDelta))
                .monospacedDigit()
                .foregroundStyle(pass.paceDelta < 0 ? Color.green : Color.red)
                .frame(width: 64, alignment: .trailing)
        }
    }

    private func tag(_ number: Int, _ drivers: [Int: Driver]) -> some View {
        let driver = drivers[number]
        return Text(driver?.nameAcronym ?? "#\(number)")
            .fontWeight(.bold)
            .foregroundStyle(Color(teamHex: driver?.teamColour))
    }
}
