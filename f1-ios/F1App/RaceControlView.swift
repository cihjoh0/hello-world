import SwiftUI
import F1Core

struct RaceControlData {
    let messages: [RaceControlMessage]
    let drivers: [Int: Driver]
}

@MainActor
final class RaceControlViewModel: ObservableObject {
    @Published var state: LoadState<RaceControlData> = .idle

    func load(sessionKey: Int) async {
        state = .loading
        do {
            let client = OpenF1Client.shared
            async let messages = client.raceControl(sessionKey: sessionKey)
            async let drivers = client.drivers(sessionKey: sessionKey)
            let loadedMessages = try await messages
            let loadedDrivers = try await drivers
            let map = Dictionary(loadedDrivers.map { ($0.driverNumber, $0) }, uniquingKeysWith: { first, _ in first })
            state = .loaded(RaceControlData(messages: loadedMessages.sorted { $0.date < $1.date }, drivers: map))
        } catch {
            if !Task.isCancelled { state = .failed(error.localizedDescription) }
        }
    }
}

struct RaceControlView: View {
    let sessionKey: Int?
    @StateObject private var model = RaceControlViewModel()

    var body: some View {
        Group {
            if sessionKey == nil {
                Text("Select a race").foregroundStyle(.secondary)
            } else {
                LoadStateView(model.state) { data in
                    if data.messages.isEmpty {
                        Text("No race control messages for this session.").foregroundStyle(.secondary).padding()
                    } else {
                        List {
                            ForEach(data.messages.indices, id: \.self) { index in
                                row(data.messages[index], drivers: data.drivers)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Race Control")
        .task(id: sessionKey) {
            guard let sessionKey else { return }
            await model.load(sessionKey: sessionKey)
        }
    }

    private func row(_ message: RaceControlMessage, drivers: [Int: Driver]) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Rectangle()
                .fill(color(for: message))
                .frame(width: 3)
            Text(message.lapNumber.map { "L\($0)" } ?? "—")
                .font(.caption).foregroundStyle(.secondary)
                .frame(width: 34, alignment: .leading)
            if let number = message.driverNumber {
                Text(drivers[number]?.nameAcronym ?? "#\(number)")
                    .font(.caption.bold())
                    .foregroundStyle(Color(teamHex: drivers[number]?.teamColour))
            }
            Text(message.message ?? message.flag ?? "")
                .font(.subheadline)
        }
    }

    /// Flag colour first (most specific), then category.
    private func color(for message: RaceControlMessage) -> Color {
        let flag = (message.flag ?? "").uppercased()
        if flag.contains("RED") { return .red }
        if flag.contains("YELLOW") { return .yellow }
        if flag.contains("GREEN") { return .green }
        if flag.contains("BLUE") { return .blue }
        if flag.contains("CHEQUERED") { return .white }
        switch (message.category ?? "").uppercased() {
        case "SAFETYCAR": return .orange
        case "CAREVENT": return .pink
        case "DRS": return .cyan
        default: return .gray
        }
    }
}
