import Foundation

/// Per-driver lap durations and cumulative race time — the shared basis for
/// gap-to-leader and overtake detection.
public struct RaceTiming: Sendable {
    public let lapDuration: [Int: [Int: Double]]   // driver -> lap -> seconds
    public let cumulative: [Int: [Int: Double]]    // driver -> lap -> total seconds
    public let driverNumbers: [Int]
    public let maxLap: Int

    public init(laps: [Lap]) {
        var durations: [Int: [Int: Double]] = [:]
        for lap in laps {
            guard lap.lapNumber >= 1, let duration = lap.lapDuration, duration > 0 else { continue }
            durations[lap.driverNumber, default: [:]][lap.lapNumber] = duration
        }

        var totals: [Int: [Int: Double]] = [:]
        for (driver, byLap) in durations {
            var running = 0.0
            var out: [Int: Double] = [:]
            for lapNumber in byLap.keys.sorted() {
                running += byLap[lapNumber] ?? 0
                out[lapNumber] = running
            }
            totals[driver] = out
        }

        self.lapDuration = durations
        self.cumulative = totals
        self.driverNumbers = durations.keys.sorted()
        self.maxLap = totals.values.flatMap { $0.keys }.max() ?? 0
    }

    /// Drivers ordered by cumulative time at the end of `lap` (only drivers with
    /// a recorded time for that lap — a retired driver simply drops out).
    public func ranking(atLap lap: Int) -> [Int] {
        driverNumbers
            .filter { cumulative[$0]?[lap] != nil }
            .sorted { a, b in
                let ta = cumulative[a]?[lap] ?? 0, tb = cumulative[b]?[lap] ?? 0
                return ta != tb ? ta < tb : a < b
            }
    }

    /// driver -> lap -> seconds behind whoever led (by cumulative time) at that lap.
    public func gapToLeader() -> [Int: [Int: Double]] {
        guard maxLap >= 1 else { return [:] }
        var result: [Int: [Int: Double]] = [:]
        for lap in 1...maxLap {
            let times = driverNumbers.compactMap { cumulative[$0]?[lap] }
            guard let leader = times.min() else { continue }
            for driver in driverNumbers {
                if let t = cumulative[driver]?[lap] {
                    result[driver, default: [:]][lap] = t - leader
                }
            }
        }
        return result
    }
}
