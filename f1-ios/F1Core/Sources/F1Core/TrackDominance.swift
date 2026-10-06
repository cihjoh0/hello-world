import Foundation

public struct DominanceSector: Hashable, Sendable {
    /// The reference driver's GPS points covering this mini-sector.
    public let points: [GPSPoint]
    /// Driver number of whoever covered the sector in the least time.
    public let fastest: Int
}

public struct DominanceShare: Hashable, Sendable {
    public let driver: Int
    public let percent: Int
}

public struct DominanceResult: Sendable {
    public let sectors: [DominanceSector]
    public let shares: [DominanceShare]
    public let referenceDriver: Int
}

public enum TrackDominance {
    /// Broadcast-style track dominance: split the fastest driver's GPS lap into
    /// equal mini-sectors and find, for each, which driver covered it in the
    /// least time.
    ///
    /// Boundaries sit at the same *fraction* of each driver's own integrated lap
    /// distance rather than shared absolute metres: speed-integrated distance
    /// drifts slightly between drivers, which would misalign later sectors.
    ///
    /// - Parameters:
    ///   - telemetry: per driver, samples with `dist` already filled in.
    ///   - paths: per driver, GPS path with cumulative `dist`.
    ///   - lapTimes: per driver, fastest lap time (picks the outline/reference).
    public static func compute(
        telemetry: [Int: [TelemetrySample]],
        paths: [Int: [GPSPoint]],
        lapTimes: [Int: Double],
        sectorCount: Int = 25
    ) -> DominanceResult? {
        let drivers = telemetry.keys
            .filter { (telemetry[$0]?.count ?? 0) > 1 && (paths[$0]?.count ?? 0) > 1 }
            .sorted()
        guard drivers.count >= 2, sectorCount > 0 else { return nil }

        guard let reference = drivers.min(by: {
            (lapTimes[$0] ?? .infinity) < (lapTimes[$1] ?? .infinity)
        }), let referencePath = paths[reference], let gpsTotal = referencePath.last?.dist, gpsTotal > 0
        else { return nil }

        // Nearest GPS index for each of the sectorCount + 1 boundaries.
        var boundaries: [Int] = []
        for i in 0...sectorCount {
            let target = Double(i) / Double(sectorCount) * gpsTotal
            var lo = 0, hi = referencePath.count - 1
            while lo < hi {
                let mid = (lo + hi) / 2
                if referencePath[mid].dist < target { lo = mid + 1 } else { hi = mid }
            }
            boundaries.append(lo)
        }

        var sectors: [DominanceSector] = []
        for i in 0..<sectorCount {
            let f0 = Double(i) / Double(sectorCount)
            let f1 = Double(i + 1) / Double(sectorCount)

            var fastest: Int?
            var bestTime = Double.infinity
            for driver in drivers {
                guard let samples = telemetry[driver], let total = samples.last?.dist else { continue }
                let t0 = Telemetry.interpolate(samples, atDistance: f0 * total) { $0.elapsed }
                let t1 = Telemetry.interpolate(samples, atDistance: f1 * total) { $0.elapsed }
                let segment = t1 - t0
                if segment < bestTime { bestTime = segment; fastest = driver }
            }

            let lower = boundaries[i], upper = boundaries[i + 1]
            guard let winner = fastest, upper > lower else { continue }
            sectors.append(DominanceSector(points: Array(referencePath[lower...upper]), fastest: winner))
        }
        guard !sectors.isEmpty else { return nil }

        let shares = drivers.map { driver in
            let won = sectors.filter { $0.fastest == driver }.count
            return DominanceShare(driver: driver, percent: Int((100.0 * Double(won) / Double(sectors.count)).rounded()))
        }
        return DominanceResult(sectors: sectors, shares: shares, referenceDriver: reference)
    }
}
