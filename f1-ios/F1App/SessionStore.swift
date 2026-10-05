import Foundation
import F1Core

/// Which race weekend / session the whole app is looking at.
@MainActor
final class SessionStore: ObservableObject {
    // OpenF1 data starts in 2023.
    static let firstYear = 2023
    static let currentYear = Calendar.current.component(.year, from: Date())

    @Published var year = SessionStore.currentYear
    @Published private(set) var rounds: [Round] = []
    @Published var selectedMeetingKey: Int?
    @Published var wantsSprint = false
    @Published private(set) var roundsError: String?
    @Published private(set) var isLoadingRounds = false

    var years: [Int] { Array((Self.firstYear...Self.currentYear).reversed()) }

    var selectedRound: Round? { rounds.first { $0.meetingKey == selectedMeetingKey } }

    /// Sprint is only selectable on weekends that have one.
    var isSprint: Bool { wantsSprint && selectedRound?.sprintKey != nil }

    /// The session every panel should load, or nil until rounds have loaded.
    var sessionKey: Int? {
        guard let round = selectedRound else { return nil }
        return isSprint ? round.sprintKey : round.raceKey
    }

    func loadRounds() async {
        isLoadingRounds = true
        roundsError = nil
        rounds = []
        selectedMeetingKey = nil
        defer { isLoadingRounds = false }

        do {
            let sessions = try await OpenF1Client.shared.raceAndSprintSessions(year: year)
            let built = Rounds.build(sessions: sessions)
            rounds = built
            selectedMeetingKey = built.last?.meetingKey    // most recent race first
        } catch is CancellationError {
            // year changed mid-load; the next load replaces this one
        } catch {
            roundsError = error.localizedDescription
        }
    }
}
