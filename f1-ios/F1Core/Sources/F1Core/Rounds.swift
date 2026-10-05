import Foundation

public struct Round: Identifiable, Hashable, Sendable {
    public let meetingKey: Int
    public let location: String
    public let raceKey: Int
    public let sprintKey: Int?
    public var id: Int { meetingKey }
}

public enum Rounds {
    /// OpenF1 files the Sprint race under session_type "Race"; only session_name
    /// ("Sprint" vs "Race") reliably tells them apart. Sprint Qualifying /
    /// Shootout contain "sprint" too, so they are excluded explicitly.
    public static func isSprintRace(_ s: Session) -> Bool {
        let name = (s.sessionName ?? "").lowercased()
        return name.contains("sprint") && !name.contains("qualifying") && !name.contains("shootout")
    }

    public static func isMainRace(_ s: Session) -> Bool {
        if isSprintRace(s) { return false }
        let name = (s.sessionName ?? s.sessionType ?? "").lowercased()
        return name.contains("race")
    }

    /// One entry per race weekend whose Grand Prix has already started,
    /// oldest first, with the weekend's Sprint session key when it has one.
    public static func build(sessions: [Session], now: Date = Date()) -> [Round] {
        var sprintByMeeting: [Int: Int] = [:]
        for s in sessions where isSprintRace(s) { sprintByMeeting[s.meetingKey] = s.sessionKey }

        let races = sessions
            .filter { isMainRace($0) }
            .compactMap { s -> (Session, Date)? in
                guard let start = s.dateStart, start <= now else { return nil }
                return (s, start)
            }
            .sorted { $0.1 < $1.1 }
            .map { $0.0 }

        var seen = Set<Int>()
        var rounds: [Round] = []
        for race in races {
            guard seen.insert(race.meetingKey).inserted else { continue }
            rounds.append(Round(
                meetingKey: race.meetingKey,
                location: race.location ?? race.circuitShortName ?? "Unknown",
                raceKey: race.sessionKey,
                sprintKey: sprintByMeeting[race.meetingKey]
            ))
        }
        return rounds
    }
}
