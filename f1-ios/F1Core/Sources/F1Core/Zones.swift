import Foundation

// MARK: - Straights vs corners

public enum ZoneType: String, Hashable, Sendable {
    case straight
    case corner
}

public struct Zone: Hashable, Sendable {
    public let type: ZoneType
    public var start: Double       // metres
    public var end: Double
    public let label: String       // S1, C1, S2, ...
}

public struct ZoneStats: Hashable, Sendable {
    public var topSpeed: Double?   // straights
    public var drs: Bool = false
    public var apexSpeed: Double?  // corners
    public var brakeAt: Int?       // metres into the zone before braking starts
}

public struct ZoneSummary: Hashable, Sendable {
    public let zone: Zone
    public let perDriver: [Int: ZoneStats]
}

public enum Zones {
    /// Blips shorter than this are merged into the neighbouring zone (sensor
    /// noise, momentary lifts) instead of fragmenting a corner.
    public static let minZoneLength = 40.0

    /// Splits a distance-sorted lap into alternating straight-line zones
    /// (full throttle, no brake) and cornering zones (anything else).
    public static func detect(_ samples: [TelemetrySample]) -> [Zone] {
        guard !samples.isEmpty else { return [] }

        struct Raw { var type: ZoneType; var start: Double; var end: Double }

        var raw: [Raw] = []
        var current: Raw?
        for sample in samples {
            let type: ZoneType = (sample.throttle >= 99 && !sample.brake) ? .straight : .corner
            if var c = current, c.type == type {
                c.end = sample.dist
                current = c
            } else {
                if let c = current { raw.append(c) }
                current = Raw(type: type, start: sample.dist, end: sample.dist)
            }
        }
        if let c = current { raw.append(c) }

        // Absorb short blips into the previous zone...
        var merged: [Raw] = []
        for zone in raw {
            if !merged.isEmpty, (zone.end - zone.start) < minZoneLength {
                merged[merged.count - 1].end = zone.end
            } else {
                merged.append(zone)
            }
        }
        // ...then collapse neighbours that ended up the same type.
        var collapsed: [Raw] = []
        for zone in merged {
            if let last = collapsed.last, last.type == zone.type {
                collapsed[collapsed.count - 1].end = zone.end
            } else {
                collapsed.append(zone)
            }
        }

        var straightCount = 0, cornerCount = 0
        return collapsed.map { zone in
            let label: String
            if zone.type == .straight { straightCount += 1; label = "S\(straightCount)" }
            else { cornerCount += 1; label = "C\(cornerCount)" }
            return Zone(type: zone.type, start: zone.start, end: zone.end, label: label)
        }
    }

    /// Slices every driver's own telemetry into the reference driver's zone
    /// windows and computes the comparison metric: top speed (+DRS) on
    /// straights, apex speed and braking point on corners.
    public static func summarize(zones: [Zone], telemetry: [Int: [TelemetrySample]]) -> [ZoneSummary] {
        zones.map { zone in
            var perDriver: [Int: ZoneStats] = [:]
            for (driver, samples) in telemetry {
                let window = samples.filter { $0.dist >= zone.start && $0.dist <= zone.end }
                guard !window.isEmpty else { continue }

                var stats = ZoneStats()
                switch zone.type {
                case .straight:
                    stats.topSpeed = window.map { $0.speed }.max()
                    stats.drs = window.contains { $0.drs >= 10 }
                case .corner:
                    stats.apexSpeed = window.map { $0.speed }.min()
                    if let brakePoint = window.first(where: { $0.brake }) {
                        stats.brakeAt = Int((brakePoint.dist - zone.start).rounded())
                    }
                }
                perDriver[driver] = stats
            }
            return ZoneSummary(zone: zone, perDriver: perDriver)
        }
    }
}

// MARK: - Pit stop box time

public enum BoxTime {
    /// The pit lane time OpenF1 reports covers entry to exit (~20-30 s). The
    /// time actually stationary in the box is the longest run of ~zero-speed
    /// car data around the stop. Car data is ~3.7 Hz, so precision is ±~0.3 s.
    public static func calculate(
        carData: [CarDatum],
        pitDate: Date,
        pitDuration: Double?,
        speedThreshold: Double = 5
    ) -> Double? {
        let t0 = pitDate.timeIntervalSince1970
        let windowStart = t0 - 5
        let windowEnd = t0 + (pitDuration ?? 35) + 5

        let points = carData
            .map { (speed: Double($0.speed ?? 999), time: $0.date.timeIntervalSince1970) }
            .filter { $0.time >= windowStart && $0.time <= windowEnd }
            .sorted { $0.time < $1.time }
        guard points.count >= 2 else { return nil }

        var best = 0.0
        var runStart: Double?
        for index in points.indices {
            if points[index].speed <= speedThreshold {
                if runStart == nil { runStart = points[index].time }
            } else if let start = runStart {
                best = max(best, points[index - 1].time - start)
                runStart = nil
            }
        }
        if let start = runStart, let last = points.last {
            best = max(best, last.time - start)
        }
        return best >= 0.5 ? best : nil
    }
}
