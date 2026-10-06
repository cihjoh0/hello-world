import Foundation

public struct Overtake: Hashable, Identifiable, Sendable {
    public let lap: Int
    public let attacker: Int
    public let defender: Int
    public let posAfter: Int
    /// Attacker's lap time minus defender's on the pass lap. Negative = attacker faster.
    public let paceDelta: Double
    /// Seconds the attacker was behind before the pass (nil if unknown).
    public let gapBefore: Double?
    public var id: String { "\(lap)-\(attacker)-\(defender)" }
}

public struct OvertakeResult: Sendable {
    public let overtakes: [Overtake]
    public let driverMap: [Int: Driver]
    public let maxLap: Int
}

public enum Overtakes {
    /// Detects on-track passes by comparing each driver's rank (cumulative race
    /// time) between consecutive laps; any pair whose order flips is a pass.
    /// Excluded as non-racing position changes: pit in/out laps, Safety Car /
    /// VSC laps, and lap 1 (grid launch).
    public static func detect(
        drivers: [Driver],
        laps: [Lap],
        pitStops: [PitStop],
        raceControl: [RaceControlMessage]
    ) -> OvertakeResult {
        let driverMap = Dictionary(drivers.map { ($0.driverNumber, $0) }, uniquingKeysWith: { first, _ in first })
        let timing = RaceTiming(laps: laps)

        var pitLaps: [Int: Set<Int>] = [:]
        for stop in pitStops {
            guard let lap = stop.lapNumber, lap > 0 else { continue }
            pitLaps[stop.driverNumber, default: []].insert(lap)
        }

        let periods = safetyCarPeriods(raceControl, maxLap: timing.maxLap)
        func underCaution(_ lap: Int) -> Bool { periods.contains { lap >= $0.start && lap <= $0.end } }
        func pitted(_ driver: Int, _ lap: Int) -> Bool {
            let set = pitLaps[driver] ?? []
            return set.contains(lap) || set.contains(lap - 1)
        }

        var found: [Overtake] = []

        for lap in stride(from: 2, through: timing.maxLap, by: 1) {
            if underCaution(lap) { continue }
            let previous = timing.ranking(atLap: lap - 1)
            let current = timing.ranking(atLap: lap)
            guard !previous.isEmpty, !current.isEmpty else { continue }

            var previousPosition: [Int: Int] = [:]
            for (index, driver) in previous.enumerated() { previousPosition[driver] = index }
            var currentPosition: [Int: Int] = [:]
            for (index, driver) in current.enumerated() { currentPosition[driver] = index }

            let common = current.filter { previousPosition[$0] != nil }

            for i in 0..<common.count {
                for j in (i + 1)..<common.count {
                    let attacker = common[i], defender = common[j]      // attacker is ahead now
                    guard let before = previousPosition[attacker], let beforeDef = previousPosition[defender],
                          before > beforeDef else { continue }           // was already ahead: no swap
                    if pitted(attacker, lap) || pitted(defender, lap) { continue }

                    guard let attackerLap = timing.lapDuration[attacker]?[lap],
                          let defenderLap = timing.lapDuration[defender]?[lap] else { continue }

                    var gapBefore: Double?
                    if let a = timing.cumulative[attacker]?[lap - 1], let d = timing.cumulative[defender]?[lap - 1] {
                        gapBefore = round3(a - d)
                    }

                    found.append(Overtake(
                        lap: lap,
                        attacker: attacker,
                        defender: defender,
                        posAfter: (currentPosition[attacker] ?? 0) + 1,
                        paceDelta: round3(attackerLap - defenderLap),
                        gapBefore: gapBefore
                    ))
                }
            }
        }

        found.sort { a, b in
            if a.lap != b.lap { return a.lap < b.lap }
            if a.attacker != b.attacker { return a.attacker < b.attacker }
            return a.defender < b.defender
        }
        return OvertakeResult(overtakes: found, driverMap: driverMap, maxLap: timing.maxLap)
    }
}

func round3(_ value: Double) -> Double { (value * 1000).rounded() / 1000 }
