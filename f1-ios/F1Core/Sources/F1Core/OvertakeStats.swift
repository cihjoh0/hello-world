import Foundation

public struct YearOvertakes: Sendable {
    public let year: Int
    public let overtakes: [Overtake]
    public init(year: Int, overtakes: [Overtake]) {
        self.year = year
        self.overtakes = overtakes
    }
}

public struct HistogramBucket: Hashable, Identifiable, Sendable {
    public let label: String
    public let count: Int
    public var id: String { label }
}

public struct YearCount: Hashable, Identifiable, Sendable {
    public let year: Int
    public let count: Int
    public var id: Int { year }
}

public struct CircuitSummary: Sendable {
    public let races: Int
    public let totalOvertakes: Int
    /// Passes where the attacker was genuinely faster that lap — the ones that
    /// answer "how much pace advantage was needed".
    public let cleanCount: Int
    /// Passes completed despite the attacker's lap being slower overall.
    public let oddCount: Int
    public let medianAdvantage: Double?
    public let meanAdvantage: Double?
    public let buckets: [HistogramBucket]
    public let perYear: [YearCount]
}

public struct LeaderboardRow: Hashable, Identifiable, Sendable {
    public let driverNumber: Int
    public let driver: Driver?
    public let made: Int
    public let suffered: Int
    public var net: Int { made - suffered }
    public var id: Int { driverNumber }
}

public enum OvertakeStats {
    private static let edges: [(label: String, lower: Double, upper: Double)] = [
        ("0–0.2s", 0, 0.2), ("0.2–0.4s", 0.2, 0.4), ("0.4–0.6s", 0.4, 0.6),
        ("0.6–0.8s", 0.6, 0.8), ("0.8–1.0s", 0.8, 1.0), ("1.0s+", 1.0, .infinity),
    ]

    public static func median(_ values: [Double]) -> Double? {
        guard !values.isEmpty else { return nil }
        let sorted = values.sorted()
        let mid = sorted.count / 2
        return sorted.count % 2 == 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
    }

    public static func buckets(advantages: [Double]) -> [HistogramBucket] {
        edges.map { edge in
            HistogramBucket(
                label: edge.label,
                count: advantages.filter { $0 >= edge.lower && $0 < edge.upper }.count)
        }
    }

    /// Pace advantage needed to pass at one circuit, pooled across its races.
    public static func circuitSummary(_ years: [YearOvertakes]) -> CircuitSummary? {
        guard !years.isEmpty else { return nil }
        let all = years.flatMap { $0.overtakes }
        let advantages = all.filter { $0.paceDelta < 0 }.map { -$0.paceDelta }
        let mean = advantages.isEmpty ? nil : advantages.reduce(0, +) / Double(advantages.count)

        return CircuitSummary(
            races: years.count,
            totalOvertakes: all.count,
            cleanCount: advantages.count,
            oddCount: all.count - advantages.count,
            medianAdvantage: median(advantages),
            meanAdvantage: mean,
            buckets: buckets(advantages: advantages),
            perYear: years.map { YearCount(year: $0.year, count: $0.overtakes.count) }
                .sorted { $0.year < $1.year }
        )
    }

    /// Passes made vs. suffered per driver across several races.
    public static func leaderboard(_ results: [OvertakeResult]) -> [LeaderboardRow] {
        var made: [Int: Int] = [:]
        var suffered: [Int: Int] = [:]
        var info: [Int: Driver] = [:]

        for result in results {
            for (number, driver) in result.driverMap where info[number] == nil {
                info[number] = driver
            }
            for pass in result.overtakes {
                made[pass.attacker, default: 0] += 1
                suffered[pass.defender, default: 0] += 1
            }
        }

        let numbers = Set(made.keys).union(suffered.keys)
        return numbers
            .map { LeaderboardRow(driverNumber: $0, driver: info[$0], made: made[$0] ?? 0, suffered: suffered[$0] ?? 0) }
            .sorted { a, b in
                a.made != b.made ? a.made > b.made : a.driverNumber < b.driverNumber
            }
    }
}
