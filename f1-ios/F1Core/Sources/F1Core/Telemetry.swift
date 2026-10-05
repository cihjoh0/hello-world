import Foundation

/// One car-data sample for a single lap, with cumulative distance added.
public struct TelemetrySample: Hashable, Sendable {
    public var elapsed: Double = 0     // seconds since lap start
    public var speed: Double = 0       // km/h
    public var throttle: Double = 0    // 0-100
    public var brake: Bool = false
    public var gear: Int = 0
    public var drs: Int = 0
    public var dist: Double = 0        // metres, integrated from speed
}

public struct GPSPoint: Hashable, Sendable {
    public var x: Double
    public var y: Double
    public var dist: Double            // cumulative Euclidean distance along the path
}

public enum Telemetry {
    /// Samples belonging to one lap (~3.7 Hz), sorted by time, distance not yet filled in.
    public static func extractLap(_ carData: [CarDatum], lap: Lap) -> [TelemetrySample] {
        guard let start = lap.dateStart, let duration = lap.lapDuration else { return [] }
        let t0 = start.timeIntervalSince1970
        let t1 = t0 + duration
        return carData
            .filter { $0.date.timeIntervalSince1970 >= t0 && $0.date.timeIntervalSince1970 <= t1 }
            .map {
                TelemetrySample(
                    elapsed: round3($0.date.timeIntervalSince1970 - t0),
                    speed: Double($0.speed ?? 0),
                    throttle: Double($0.throttle ?? 0),
                    brake: ($0.brake ?? 0) > 0,
                    gear: $0.nGear ?? 0,
                    drs: $0.drs ?? 0
                )
            }
            .sorted { $0.elapsed < $1.elapsed }
    }

    /// Fills in cumulative distance by trapezoidal integration of speed.
    /// Converting time-indexed samples to distance lets two drivers be compared
    /// at the same point on track regardless of pace.
    public static func addDistance(_ samples: [TelemetrySample]) -> [TelemetrySample] {
        guard var previous = samples.first else { return [] }
        previous.dist = 0
        var out = [previous]
        for sample in samples.dropFirst() {
            var next = sample
            let dt = sample.elapsed - previous.elapsed
            let averageMetresPerSecond = (sample.speed + previous.speed) / 2 / 3.6
            next.dist = previous.dist + averageMetresPerSecond * dt
            out.append(next)
            previous = next
        }
        return out
    }

    /// Linear interpolation of `value` at `distance` metres (binary search + lerp).
    public static func interpolate(
        _ samples: [TelemetrySample],
        atDistance target: Double,
        _ value: (TelemetrySample) -> Double
    ) -> Double {
        guard !samples.isEmpty else { return 0 }
        var lo = 0, hi = samples.count - 1
        while lo < hi {
            let mid = (lo + hi) / 2
            if samples[mid].dist < target { lo = mid + 1 } else { hi = mid }
        }
        if lo == 0 { return value(samples[0]) }
        let a = samples[lo - 1], b = samples[lo]
        if b.dist == a.dist { return value(a) }
        let fraction = (target - a.dist) / (b.dist - a.dist)
        return value(a) + fraction * (value(b) - value(a))
    }

    // MARK: GPS

    public static func extractLapPath(_ locations: [LocationSample], lap: Lap) -> [GPSPoint] {
        guard let start = lap.dateStart, let duration = lap.lapDuration else { return [] }
        let t0 = start.timeIntervalSince1970
        let t1 = t0 + duration
        let points = locations
            .filter { $0.date.timeIntervalSince1970 >= t0 && $0.date.timeIntervalSince1970 <= t1 }
            .map { GPSPoint(x: $0.x ?? 0, y: $0.y ?? 0, dist: 0) }
        return buildPath(points)
    }

    /// Adds cumulative Euclidean distance along a GPS path.
    public static func buildPath(_ points: [GPSPoint]) -> [GPSPoint] {
        guard var previous = points.first else { return [] }
        previous.dist = 0
        var out = [previous]
        for point in points.dropFirst() {
            var next = point
            let dx = point.x - previous.x, dy = point.y - previous.y
            next.dist = previous.dist + (dx * dx + dy * dy).squareRoot()
            out.append(next)
            previous = next
        }
        return out
    }
}
