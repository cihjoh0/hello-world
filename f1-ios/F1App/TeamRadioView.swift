import SwiftUI
import AVFoundation
import F1Core

/// Plays one team-radio clip at a time.
@MainActor
final class RadioPlayer: ObservableObject {
    @Published private(set) var playingID: String?
    private var player: AVPlayer?
    private var endObserver: NSObjectProtocol?

    func toggle(_ entry: RadioEntry) {
        if playingID == entry.id {
            stop()
            return
        }
        guard let urlString = entry.clip.recordingUrl, let url = URL(string: urlString) else { return }
        stop()

        #if os(iOS)
        // Without the playback category, clips are silent when the ringer switch is off.
        try? AVAudioSession.sharedInstance().setCategory(.playback)
        try? AVAudioSession.sharedInstance().setActive(true)
        #endif

        let item = AVPlayerItem(url: url)
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.stop() }
        }
        let newPlayer = AVPlayer(playerItem: item)
        player = newPlayer
        playingID = entry.id
        newPlayer.play()
    }

    func stop() {
        player?.pause()
        player = nil
        playingID = nil
        if let observer = endObserver {
            NotificationCenter.default.removeObserver(observer)
            endObserver = nil
        }
    }
}

struct TeamRadioData {
    let entries: [RadioEntry]
    let drivers: [Int: Driver]
}

@MainActor
final class TeamRadioViewModel: ObservableObject {
    @Published var state: LoadState<TeamRadioData> = .idle

    func load(sessionKey: Int) async {
        state = .loading
        do {
            let client = OpenF1Client.shared
            async let clips = client.teamRadio(sessionKey: sessionKey)
            async let laps = client.laps(sessionKey: sessionKey)
            async let drivers = client.drivers(sessionKey: sessionKey)
            async let sessions: [Session] = client.get("sessions", ["session_key": String(sessionKey)])

            let loadedClips = try await clips
            let loadedLaps = try await laps
            let loadedDrivers = try await drivers
            let loadedSessions = try await sessions
            let start = loadedSessions.first?.dateStart

            let map = Dictionary(loadedDrivers.map { ($0.driverNumber, $0) }, uniquingKeysWith: { first, _ in first })
            state = .loaded(TeamRadioData(
                entries: TeamRadio.annotate(clips: loadedClips, laps: loadedLaps, sessionStart: start),
                drivers: map))
        } catch {
            if !Task.isCancelled { state = .failed(error.localizedDescription) }
        }
    }
}

struct TeamRadioView: View {
    let sessionKey: Int?
    @StateObject private var model = TeamRadioViewModel()
    @StateObject private var player = RadioPlayer()
    @State private var filterDriver: Int?

    var body: some View {
        Group {
            if sessionKey == nil {
                Text("Select a race").foregroundStyle(.secondary)
            } else {
                LoadStateView(model.state) { data in
                    content(data)
                }
            }
        }
        .navigationTitle("Team Radio")
        .task(id: sessionKey) {
            player.stop()
            filterDriver = nil
            guard let sessionKey else { return }
            await model.load(sessionKey: sessionKey)
        }
        .onDisappear { player.stop() }
    }

    @ViewBuilder
    private func content(_ data: TeamRadioData) -> some View {
        if data.entries.isEmpty {
            Text("No team radio recordings for this session.").foregroundStyle(.secondary).padding()
        } else {
            let driverNumbers = Array(Set(data.entries.map { $0.clip.driverNumber })).sorted()
            let shown = data.entries.filter { filterDriver == nil || $0.clip.driverNumber == filterDriver }
            List {
                Section {
                    Picker("Driver", selection: $filterDriver) {
                        Text("All drivers").tag(Int?.none)
                        ForEach(driverNumbers, id: \.self) { number in
                            Text(data.drivers[number]?.nameAcronym ?? "#\(number)").tag(Int?.some(number))
                        }
                    }
                }
                Section("\(shown.count) recording\(shown.count == 1 ? "" : "s")") {
                    ForEach(shown) { entry in
                        row(entry, drivers: data.drivers)
                    }
                }
            }
        }
    }

    private func row(_ entry: RadioEntry, drivers: [Int: Driver]) -> some View {
        let driver = drivers[entry.clip.driverNumber]
        let isPlaying = player.playingID == entry.id
        return HStack {
            Text(driver?.nameAcronym ?? "#\(entry.clip.driverNumber)")
                .fontWeight(.bold)
                .foregroundStyle(Color(teamHex: driver?.teamColour))
                .frame(width: 48, alignment: .leading)
            if let lap = entry.lap {
                Text("Lap \(lap)").font(.caption).foregroundStyle(.secondary)
            }
            if let elapsed = entry.elapsed {
                let seconds = Int(elapsed.rounded())
                Text(String(format: "+%ld:%02ld", seconds / 60, seconds % 60))
                    .font(.caption).foregroundStyle(.tertiary)
            }
            Spacer()
            Button(isPlaying ? "Stop" : "Play") { player.toggle(entry) }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(entry.clip.recordingUrl == nil)
        }
    }
}
