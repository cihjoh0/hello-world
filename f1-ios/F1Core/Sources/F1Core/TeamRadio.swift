import Foundation

public struct RadioEntry: Identifiable, Hashable, Sendable {
    public let clip: TeamRadioClip
    /// The lap the driver was on when the message was recorded.
    public let lap: Int?
    /// Seconds into the session.
    public let elapsed: TimeInterval?
    public var id: String { "\(clip.driverNumber)-\(clip.date.timeIntervalSince1970)" }
}

public enum TeamRadio {
    /// Chronological clips, each tagged with the lap it was recorded on
    /// (the driver's latest lap that had already started) and the time into the session.
    public static func annotate(clips: [TeamRadioClip], laps: [Lap], sessionStart: Date?) -> [RadioEntry] {
        var lapStarts: [Int: [(lap: Int, date: Date)]] = [:]
        for lap in laps {
            guard let start = lap.dateStart else { continue }
            lapStarts[lap.driverNumber, default: []].append((lap: lap.lapNumber, date: start))
        }
        for key in lapStarts.keys {
            lapStarts[key]?.sort { $0.date < $1.date }
        }

        return clips.sorted { $0.date < $1.date }.map { clip in
            var found: Int?
            for entry in lapStarts[clip.driverNumber] ?? [] {
                if entry.date <= clip.date { found = entry.lap } else { break }
            }
            var elapsed: TimeInterval?
            if let start = sessionStart {
                let seconds = clip.date.timeIntervalSince(start)
                if seconds >= 0 { elapsed = seconds }
            }
            return RadioEntry(clip: clip, lap: found, elapsed: elapsed)
        }
    }
}
