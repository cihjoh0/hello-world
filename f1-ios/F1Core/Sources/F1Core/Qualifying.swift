import Foundation

public enum Qualifying {
    /// The main Qualifying session, not Sprint Qualifying / Sprint Shootout
    /// (both are filed under session_type "Qualifying" on sprint weekends).
    public static func isMainQualifying(_ s: Session) -> Bool {
        let name = (s.sessionName ?? "").lowercased()
        let type = (s.sessionType ?? "").lowercased()
        guard name.contains("qualifying") || type.contains("qualifying") else { return false }
        return !name.contains("sprint")
    }

    /// Each driver's fastest valid lap. Laps without a start timestamp are
    /// skipped because telemetry can't be sliced out for them.
    public static func fastestLaps(_ laps: [Lap]) -> [Int: Lap] {
        var best: [Int: Lap] = [:]
        for lap in laps {
            guard let duration = lap.lapDuration, duration > 0, lap.dateStart != nil else { continue }
            if let current = best[lap.driverNumber], let currentDuration = current.lapDuration, currentDuration <= duration {
                continue
            }
            best[lap.driverNumber] = lap
        }
        return best
    }

    /// Drivers ordered fastest first.
    public static func ranked(_ fastest: [Int: Lap]) -> [(driver: Int, lap: Lap)] {
        fastest
            .map { (driver: $0.key, lap: $0.value) }
            .sorted { a, b in
                let ta = a.lap.lapDuration ?? .infinity, tb = b.lap.lapDuration ?? .infinity
                return ta != tb ? ta < tb : a.driver < b.driver
            }
    }
}
