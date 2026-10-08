import SwiftUI
import Charts
import F1Core

private let driverPalette: [Color] = [.red, .blue, .green, .orange]
private let maxCompared = 4

struct QualifyingSetup {
    let session: Session
    let drivers: [Int: Driver]
    let ranked: [(driver: Int, lap: Lap)]
}

@MainActor
final class QualifyingViewModel: ObservableObject {
    @Published var setup: LoadState<QualifyingSetup> = .idle
    @Published private(set) var selected: [Int] = []
    @Published private(set) var telemetry: [Int: [TelemetrySample]] = [:]   // distance filled in
    @Published private(set) var paths: [Int: [GPSPoint]] = [:]
    @Published private(set) var loading: Set<Int> = []
    @Published private(set) var errors: [Int: String] = [:]

    private var fastest: [Int: Lap] = [:]
    private var sessionKey: Int?

    var lapTimes: [Int: Double] { fastest.compactMapValues { $0.lapDuration } }

    func load(meetingKey: Int) async {
        setup = .loading
        selected = []
        telemetry = [:]
        paths = [:]
        errors = [:]
        loading = []
        do {
            let client = OpenF1Client.shared
            guard let session = try await client.qualifyingSession(meetingKey: meetingKey) else {
                setup = .failed("No qualifying session found for this weekend.")
                return
            }
            async let laps = client.laps(sessionKey: session.sessionKey)
            async let drivers = client.drivers(sessionKey: session.sessionKey)
            let loadedLaps = try await laps
            let loadedDrivers = try await drivers

            fastest = Qualifying.fastestLaps(loadedLaps)
            sessionKey = session.sessionKey
            let map = Dictionary(loadedDrivers.map { ($0.driverNumber, $0) }, uniquingKeysWith: { first, _ in first })
            let ranked = Qualifying.ranked(fastest)
            setup = .loaded(QualifyingSetup(session: session, drivers: map, ranked: ranked))

            // Default to the top three; telemetry downloads are large, so they stay on demand after that.
            selected = Array(ranked.prefix(3).map { $0.driver })
            for driver in selected { Task { await loadTelemetry(driver) } }
        } catch {
            if !Task.isCancelled { setup = .failed(error.localizedDescription) }
        }
    }

    func toggle(_ driver: Int) {
        if let index = selected.firstIndex(of: driver) {
            selected.remove(at: index)
        } else if selected.count < maxCompared {
            selected.append(driver)
            Task { await loadTelemetry(driver) }
        }
    }

    private func loadTelemetry(_ driver: Int) async {
        guard telemetry[driver] == nil, !loading.contains(driver),
              let lap = fastest[driver], let sessionKey else { return }
        loading.insert(driver)
        errors[driver] = nil
        defer { loading.remove(driver) }
        do {
            let client = OpenF1Client.shared
            async let car = client.carData(sessionKey: sessionKey, driverNumber: driver)
            async let location = client.location(sessionKey: sessionKey, driverNumber: driver)
            let carData = try await car
            let locations = try await location

            let samples = Telemetry.addDistance(Telemetry.extractLap(carData, lap: lap))
            if samples.count < 2 {
                errors[driver] = "No car data for this lap"
                return
            }
            telemetry[driver] = samples
            paths[driver] = Telemetry.extractLapPath(locations, lap: lap)
        } catch {
            errors[driver] = error.localizedDescription
        }
    }

    // MARK: Derived comparisons

    /// Selected drivers whose telemetry has arrived.
    var loadedDrivers: [Int] { selected.filter { (telemetry[$0]?.count ?? 0) > 1 } }

    /// The fastest of the loaded drivers defines zone boundaries and the map outline,
    /// so changing the selection can't hand them to a slower lap.
    var referenceDriver: Int? {
        loadedDrivers.min { (lapTimes[$0] ?? .infinity) < (lapTimes[$1] ?? .infinity) }
    }

    var zoneSummaries: [ZoneSummary] {
        guard let reference = referenceDriver, let samples = telemetry[reference] else { return [] }
        let zones = Zones.detect(samples)
        var perDriver: [Int: [TelemetrySample]] = [:]
        for driver in loadedDrivers { perDriver[driver] = telemetry[driver] }
        return Zones.summarize(zones: zones, telemetry: perDriver)
    }

    var dominance: DominanceResult? {
        var tel: [Int: [TelemetrySample]] = [:]
        var pth: [Int: [GPSPoint]] = [:]
        for driver in loadedDrivers {
            tel[driver] = telemetry[driver]
            pth[driver] = paths[driver]
        }
        return TrackDominance.compute(telemetry: tel, paths: pth, lapTimes: lapTimes)
    }

    func color(for driver: Int) -> Color {
        guard let index = selected.firstIndex(of: driver) else { return .gray }
        return driverPalette[index % driverPalette.count]
    }
}

struct QualifyingView: View {
    let meetingKey: Int?
    @StateObject private var model = QualifyingViewModel()
    @State private var mode: Mode = .zones

    enum Mode: String, CaseIterable, Identifiable {
        case zones = "Straights & Corners"
        case dominance = "Track Dominance"
        var id: String { rawValue }
    }

    var body: some View {
        Group {
            if meetingKey == nil {
                Text("Select a race").foregroundStyle(.secondary)
            } else {
                LoadStateView(model.setup) { setup in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 14) {
                            driverChips(setup)
                            Picker("View", selection: $mode) {
                                ForEach(Mode.allCases) { Text($0.rawValue).tag($0) }
                            }
                            .pickerStyle(.segmented)

                            if !model.loading.isEmpty {
                                HStack { ProgressView(); Text("Loading telemetry…").font(.footnote).foregroundStyle(.secondary) }
                            }
                            ForEach(model.errors.keys.sorted(), id: \.self) { driver in
                                Text("\(setup.drivers[driver]?.nameAcronym ?? "#\(driver)"): \(model.errors[driver] ?? "")")
                                    .font(.footnote).foregroundStyle(Color.red)
                            }

                            switch mode {
                            case .zones: zonesPanel(setup)
                            case .dominance: dominancePanel(setup)
                            }

                            Text("Each driver's fastest qualifying lap. Pick up to \(maxCompared) drivers.")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                        .padding()
                    }
                }
            }
        }
        .navigationTitle("Qualifying")
        .task(id: meetingKey) {
            guard let meetingKey else { return }
            await model.load(meetingKey: meetingKey)
        }
    }

    // MARK: Driver chips

    private func driverChips(_ setup: QualifyingSetup) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack {
                ForEach(setup.ranked.indices, id: \.self) { index in
                    let entry = setup.ranked[index]
                    let isSelected = model.selected.contains(entry.driver)
                    let driver = setup.drivers[entry.driver]
                    Button { model.toggle(entry.driver) } label: {
                        VStack(spacing: 2) {
                            Text("P\(index + 1) \(driver?.nameAcronym ?? "#\(entry.driver)")")
                                .font(.caption.bold())
                                .foregroundStyle(Color(teamHex: driver?.teamColour))
                            Text(lapString(entry.lap.lapDuration)).font(.caption2).foregroundStyle(.secondary)
                        }
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(isSelected ? model.color(for: entry.driver).opacity(0.25) : Color.gray.opacity(0.12))
                        .overlay(RoundedRectangle(cornerRadius: 8)
                            .stroke(isSelected ? model.color(for: entry.driver) : Color.clear, lineWidth: 2))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                    .disabled(!isSelected && model.selected.count >= maxCompared)
                }
            }
        }
    }

    private func lapString(_ seconds: Double?) -> String {
        guard let seconds else { return "—" }
        let minutes = Int(seconds) / 60
        return String(format: "%ld:%06.3f", minutes, seconds - Double(minutes * 60))
    }

    // MARK: Straights & corners

    @ViewBuilder
    private func zonesPanel(_ setup: QualifyingSetup) -> some View {
        let summaries = model.zoneSummaries
        if summaries.isEmpty {
            placeholder("No telemetry available to detect straights and corners yet.")
        } else {
            speedChart(summaries)
                .frame(height: 220)
            Text("Green = straight-line zones, yellow = cornering zones. Zones come from \(setup.drivers[model.referenceDriver ?? 0]?.nameAcronym ?? "the fastest driver")'s throttle and brake trace.")
                .font(.footnote).foregroundStyle(.secondary)
            zoneTable(summaries, setup: setup)
        }
    }

    private struct SpeedPoint: Identifiable {
        let distance: Double
        let speed: Double
        var id: Double { distance }
    }

    private struct SpeedLine: Identifiable {
        let driver: Int
        let color: Color
        let points: [SpeedPoint]
        var id: Int { driver }
    }

    /// Speed traces resampled every 25 m so drivers share one distance axis.
    private func speedLines() -> [SpeedLine] {
        let drivers = model.loadedDrivers
        let maxDistance = drivers.compactMap { model.telemetry[$0]?.last?.dist }.min() ?? 0
        let steps = Array(stride(from: 0.0, through: maxDistance, by: 25.0))
        return drivers.map { driver in
            let samples = model.telemetry[driver] ?? []
            let points = steps.map { distance in
                SpeedPoint(distance: distance,
                           speed: Telemetry.interpolate(samples, atDistance: distance) { $0.speed })
            }
            return SpeedLine(driver: driver, color: model.color(for: driver), points: points)
        }
    }

    private func speedChart(_ summaries: [ZoneSummary]) -> some View {
        let lines = speedLines()
        let zones = summaries.map { $0.zone }
        return Chart {
            ForEach(zones.indices, id: \.self) { index in
                RectangleMark(
                    xStart: .value("From", zones[index].start), xEnd: .value("To", zones[index].end),
                    yStart: .value("Min", 0.0), yEnd: .value("Max", 360.0)
                )
                .foregroundStyle((zones[index].type == .straight ? Color.green : Color.yellow).opacity(0.10))
            }
            ForEach(lines) { line in
                ForEach(line.points) { point in
                    LineMark(
                        x: .value("Distance (m)", point.distance),
                        y: .value("km/h", point.speed),
                        series: .value("Driver", line.driver)
                    )
                    .foregroundStyle(line.color)
                }
            }
        }
        .chartXAxisLabel("Distance (m)")
        .chartYAxisLabel("km/h")
    }

    private func zoneTable(_ summaries: [ZoneSummary], setup: QualifyingSetup) -> some View {
        let drivers = model.loadedDrivers
        return VStack(spacing: 0) {
            HStack {
                Text("Zone").font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading)
                ForEach(drivers, id: \.self) { driver in
                    Text(setup.drivers[driver]?.nameAcronym ?? "#\(driver)")
                        .font(.caption.bold()).foregroundStyle(model.color(for: driver))
                        .frame(width: 78, alignment: .trailing)
                }
            }
            .padding(.vertical, 6)
            Divider()
            ForEach(summaries.indices, id: \.self) { index in
                zoneRow(summaries[index], drivers: drivers)
                Divider()
            }
        }
    }

    private func zoneRow(_ summary: ZoneSummary, drivers: [Int]) -> some View {
        let isStraight = summary.zone.type == .straight
        let values = drivers.map { driver -> Double? in
            let stats = summary.perDriver[driver]
            return isStraight ? stats?.topSpeed : stats?.apexSpeed
        }
        let best = values.compactMap { $0 }.max()
        return HStack(alignment: .top) {
            Text("\(isStraight ? "↑" : "⟲") \(summary.zone.label)  \(Int((summary.zone.end - summary.zone.start).rounded()))m")
                .font(.caption.bold())
                .foregroundStyle(isStraight ? Color.green : Color.yellow)
                .frame(maxWidth: .infinity, alignment: .leading)
            ForEach(drivers.indices, id: \.self) { index in
                let value = values[index]
                let stats = summary.perDriver[drivers[index]]
                VStack(alignment: .trailing, spacing: 0) {
                    Text(value.map { "\(Int($0.rounded())) km/h" } ?? "—")
                        .font(.caption.monospacedDigit())
                        .fontWeight(value != nil && value == best ? .bold : .regular)
                        .foregroundStyle(value != nil && value == best ? Color.purple : Color.primary)
                    if isStraight, stats?.drs == true {
                        Text("DRS").font(.system(size: 9, weight: .bold)).foregroundStyle(Color.cyan)
                    } else if !isStraight, let brake = stats?.brakeAt {
                        Text("brk \(brake)m in").font(.system(size: 9)).foregroundStyle(.secondary)
                    }
                }
                .frame(width: 78, alignment: .trailing)
            }
        }
        .padding(.vertical, 6)
    }

    // MARK: Track dominance

    @ViewBuilder
    private func dominancePanel(_ setup: QualifyingSetup) -> some View {
        if let result = model.dominance {
            DominanceMapView(result: result, colorFor: { model.color(for: $0) })
                .frame(height: 280)
            HStack(spacing: 16) {
                ForEach(result.shares, id: \.driver) { share in
                    HStack(spacing: 5) {
                        RoundedRectangle(cornerRadius: 2).fill(model.color(for: share.driver)).frame(width: 10, height: 10)
                        Text(setup.drivers[share.driver]?.nameAcronym ?? "#\(share.driver)")
                            .font(.caption.bold()).foregroundStyle(model.color(for: share.driver))
                        Text("\(share.percent)%").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            Text("The lap is split into \(result.sectors.count) mini-sectors; each is coloured by whoever covered it fastest.")
                .font(.footnote).foregroundStyle(.secondary)
        } else {
            placeholder(model.selected.count < 2
                ? "Select at least two drivers to compare track dominance."
                : "No telemetry or GPS data available yet.")
        }
    }

    private func placeholder(_ text: String) -> some View {
        Text(text).foregroundStyle(.secondary).frame(maxWidth: .infinity, minHeight: 100)
    }
}

/// The reference driver's GPS lap, each mini-sector drawn in its fastest driver's colour.
struct DominanceMapView: View {
    let result: DominanceResult
    let colorFor: (Int) -> Color

    var body: some View {
        Canvas { context, size in
            let points = result.sectors.flatMap { $0.points }
            guard let minX = points.map(\.x).min(), let maxX = points.map(\.x).max(),
                  let minY = points.map(\.y).min(), let maxY = points.map(\.y).max() else { return }

            let padding: CGFloat = 16
            let width = CGFloat(max(maxX - minX, 1)), height = CGFloat(max(maxY - minY, 1))
            let scale = min((size.width - 2 * padding) / width, (size.height - 2 * padding) / height)
            let offsetX = (size.width - width * scale) / 2
            let offsetY = (size.height - height * scale) / 2

            func place(_ p: GPSPoint) -> CGPoint {
                CGPoint(x: offsetX + CGFloat(p.x - minX) * scale,
                        y: size.height - (offsetY + CGFloat(p.y - minY) * scale))   // flip Y: GPS y points up
            }

            for sector in result.sectors {
                guard let first = sector.points.first else { continue }
                var path = Path()
                path.move(to: place(first))
                for point in sector.points.dropFirst() { path.addLine(to: place(point)) }
                context.stroke(
                    path, with: .color(colorFor(sector.fastest)),
                    style: StrokeStyle(lineWidth: 6, lineCap: .round, lineJoin: .round))
            }
        }
        .background(Color.black.opacity(0.35))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}
