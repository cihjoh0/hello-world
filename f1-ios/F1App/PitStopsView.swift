import SwiftUI
import F1Core

struct PitStopsData {
    let stops: [PitStop]
    let drivers: [Int: Driver]
}

enum BoxTimeState {
    case measuring
    case measured(Double?)     // nil = no clear standstill found in the telemetry
    case failed
}

@MainActor
final class PitStopsViewModel: ObservableObject {
    @Published var state: LoadState<PitStopsData> = .idle
    /// "driver-lap" -> measurement. Stationary time needs a large per-driver
    /// car-data download, so it is fetched on demand, one stop at a time.
    @Published var boxTimes: [String: BoxTimeState] = [:]
    private var sessionKey: Int?

    func load(sessionKey: Int) async {
        self.sessionKey = sessionKey
        boxTimes = [:]
        state = .loading
        do {
            let client = OpenF1Client.shared
            async let stops = client.pitStops(sessionKey: sessionKey)
            async let drivers = client.drivers(sessionKey: sessionKey)
            let loadedStops = try await stops
            let loadedDrivers = try await drivers
            let map = Dictionary(loadedDrivers.map { ($0.driverNumber, $0) }, uniquingKeysWith: { first, _ in first })
            let valid = loadedStops
                .filter { ($0.pitDuration ?? 0) > 0 && $0.date != nil }
                .sorted { ($0.lapNumber ?? 0) < ($1.lapNumber ?? 0) }
            state = .loaded(PitStopsData(stops: valid, drivers: map))
        } catch {
            if !Task.isCancelled { state = .failed(error.localizedDescription) }
        }
    }

    static func key(_ stop: PitStop) -> String { "\(stop.driverNumber)-\(stop.lapNumber ?? 0)" }

    func measure(_ stop: PitStop) async {
        guard let sessionKey, let date = stop.date else { return }
        let key = Self.key(stop)
        if case .some(.measuring) = boxTimes[key] { return }
        boxTimes[key] = .measuring
        do {
            let carData = try await OpenF1Client.shared.carData(sessionKey: sessionKey, driverNumber: stop.driverNumber)
            let seconds = BoxTime.calculate(carData: carData, pitDate: date, pitDuration: stop.pitDuration)
            boxTimes[key] = .measured(seconds)
        } catch {
            boxTimes[key] = .failed
        }
    }
}

struct PitStopsView: View {
    let sessionKey: Int?
    @StateObject private var model = PitStopsViewModel()

    var body: some View {
        Group {
            if sessionKey == nil {
                Text("Select a race").foregroundStyle(.secondary)
            } else {
                LoadStateView(model.state) { data in
                    if data.stops.isEmpty {
                        Text("No pit stops recorded for this session.").foregroundStyle(.secondary).padding()
                    } else {
                        List {
                            ForEach(data.stops.indices, id: \.self) { index in
                                row(data.stops[index], drivers: data.drivers)
                            }
                            Section {
                                Text("Lane time is entry to exit. Box time is the time actually stationary, derived from car speed telemetry (±~0.3 s). Tap Measure to download telemetry for that stop.")
                                    .font(.footnote).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Pit Stops")
        .task(id: sessionKey) {
            guard let sessionKey else { return }
            await model.load(sessionKey: sessionKey)
        }
    }

    private func row(_ stop: PitStop, drivers: [Int: Driver]) -> some View {
        let driver = drivers[stop.driverNumber]
        return HStack {
            Text("L\(stop.lapNumber ?? 0)").font(.caption).foregroundStyle(.secondary).frame(width: 36, alignment: .leading)
            Text(driver?.nameAcronym ?? "#\(stop.driverNumber)")
                .fontWeight(.bold)
                .foregroundStyle(Color(teamHex: driver?.teamColour))
            Spacer()
            Text(String(format: "%.1fs", stop.pitDuration ?? 0))
                .monospacedDigit().foregroundStyle(.secondary)
            boxTimeView(for: stop)
                .frame(width: 84, alignment: .trailing)
        }
    }

    @ViewBuilder
    private func boxTimeView(for stop: PitStop) -> some View {
        switch model.boxTimes[PitStopsViewModel.key(stop)] {
        case .none:
            Button("Measure") { Task { await model.measure(stop) } }
                .buttonStyle(.bordered)
                .controlSize(.small)
        case .some(.measuring):
            ProgressView()
        case .some(.measured(let seconds)):
            if let seconds {
                Text(String(format: "%.1fs", seconds))
                    .monospacedDigit().fontWeight(.semibold).foregroundStyle(Color.yellow)
            } else {
                Text("No data").font(.caption).foregroundStyle(.secondary)
            }
        case .some(.failed):
            Button("Retry") { Task { await model.measure(stop) } }
                .buttonStyle(.bordered)
                .controlSize(.small)
        }
    }
}
