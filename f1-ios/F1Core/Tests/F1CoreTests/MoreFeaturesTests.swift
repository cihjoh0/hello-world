import XCTest
@testable import F1Core

private func at(_ seconds: Double) -> Date { Date(timeIntervalSince1970: 1_700_000_000 + seconds) }

final class QualifyingTests: XCTestCase {
    private func session(_ name: String, type: String = "Qualifying") -> Session {
        Session(sessionKey: 1, meetingKey: 1, sessionName: name, sessionType: type)
    }

    func testMainQualifyingExcludesSprintVariants() {
        XCTAssertTrue(Qualifying.isMainQualifying(session("Qualifying")))
        XCTAssertFalse(Qualifying.isMainQualifying(session("Sprint Qualifying")))
        XCTAssertFalse(Qualifying.isMainQualifying(session("Sprint Shootout")))
        XCTAssertFalse(Qualifying.isMainQualifying(session("Practice 1", type: "Practice")))
    }

    func testFastestLapsPicksBestValidLapPerDriver() {
        let laps = [
            Lap(driverNumber: 1, lapNumber: 1, lapDuration: 92, dateStart: at(0)),
            Lap(driverNumber: 1, lapNumber: 2, lapDuration: 90.5, dateStart: at(100)),
            Lap(driverNumber: 1, lapNumber: 3, lapDuration: 89, dateStart: nil),        // no start: unusable
            Lap(driverNumber: 1, lapNumber: 4, lapDuration: 0, dateStart: at(300)),     // invalid
            Lap(driverNumber: 2, lapNumber: 1, lapDuration: 91, dateStart: at(0)),
            Lap(driverNumber: 3, lapNumber: 1, lapDuration: nil, dateStart: at(0)),     // no time
        ]
        let best = Qualifying.fastestLaps(laps)
        XCTAssertEqual(best[1]?.lapNumber, 2)
        XCTAssertEqual(best[2]?.lapNumber, 1)
        XCTAssertNil(best[3])
    }

    func testRankedIsFastestFirst() {
        let fastest: [Int: Lap] = [
            5: Lap(driverNumber: 5, lapNumber: 1, lapDuration: 91, dateStart: at(0)),
            9: Lap(driverNumber: 9, lapNumber: 1, lapDuration: 90, dateStart: at(0)),
        ]
        XCTAssertEqual(Qualifying.ranked(fastest).map { $0.driver }, [9, 5])
    }
}

final class TeamRadioTests: XCTestCase {
    func testClipsAreTaggedWithTheLapInProgress() {
        let laps = [
            Lap(driverNumber: 1, lapNumber: 1, dateStart: at(0)),
            Lap(driverNumber: 1, lapNumber: 2, dateStart: at(90)),
            Lap(driverNumber: 1, lapNumber: 3, dateStart: at(180)),
            Lap(driverNumber: 2, lapNumber: 1, dateStart: at(5)),
        ]
        let clips = [
            TeamRadioClip(driverNumber: 1, date: at(200), recordingUrl: "c"),   // lap 3
            TeamRadioClip(driverNumber: 1, date: at(100), recordingUrl: "b"),   // lap 2
            TeamRadioClip(driverNumber: 2, date: at(1), recordingUrl: "a"),     // before lap 1 started
            TeamRadioClip(driverNumber: 9, date: at(50), recordingUrl: "d"),    // driver with no laps
        ]
        let entries = TeamRadio.annotate(clips: clips, laps: laps, sessionStart: at(0))

        XCTAssertEqual(entries.map { $0.clip.recordingUrl }, ["a", "d", "b", "c"])   // chronological
        XCTAssertNil(entries[0].lap)
        XCTAssertNil(entries[1].lap)
        XCTAssertEqual(entries[2].lap, 2)
        XCTAssertEqual(entries[3].lap, 3)
        XCTAssertEqual(entries[3].elapsed ?? 0, 200, accuracy: 1e-9)
    }

    func testElapsedIsNilBeforeSessionStartOrWithoutStart() {
        let clip = TeamRadioClip(driverNumber: 1, date: at(-10), recordingUrl: "x")
        XCTAssertNil(TeamRadio.annotate(clips: [clip], laps: [], sessionStart: at(0))[0].elapsed)
        XCTAssertNil(TeamRadio.annotate(clips: [clip], laps: [], sessionStart: nil)[0].elapsed)
    }
}

final class OvertakeStatsTests: XCTestCase {
    private func pass(_ lap: Int, _ attacker: Int, _ defender: Int, delta: Double) -> Overtake {
        Overtake(lap: lap, attacker: attacker, defender: defender, posAfter: 1, paceDelta: delta, gapBefore: nil)
    }

    func testMedian() {
        XCTAssertNil(OvertakeStats.median([]))
        XCTAssertEqual(OvertakeStats.median([3, 1, 2]), 2)
        XCTAssertEqual(OvertakeStats.median([0.1, 0.15, 0.3, 0.3, 1.5, 2.0]) ?? 0, 0.3, accuracy: 1e-9)
        XCTAssertEqual(OvertakeStats.median([1, 2, 3, 4]) ?? 0, 2.5, accuracy: 1e-9)
    }

    func testBucketsIncludeLowerEdgeExcludeUpper() {
        let buckets = OvertakeStats.buckets(advantages: [0.0, 0.19, 0.2, 0.55, 1.0, 5.0])
        XCTAssertEqual(buckets.map { $0.count }, [2, 1, 1, 0, 0, 2])
        XCTAssertEqual(buckets.last?.label, "1.0s+")
    }

    func testCircuitSummarySeparatesCleanFromOddPasses() throws {
        let years = [
            YearOvertakes(year: 2024, overtakes: [pass(5, 1, 2, delta: -0.4), pass(9, 3, 4, delta: -0.2)]),
            YearOvertakes(year: 2023, overtakes: [pass(7, 1, 2, delta: -1.2), pass(8, 5, 6, delta: +0.3)]),  // odd
        ]
        let summary = try XCTUnwrap(OvertakeStats.circuitSummary(years))
        XCTAssertEqual(summary.races, 2)
        XCTAssertEqual(summary.totalOvertakes, 4)
        XCTAssertEqual(summary.cleanCount, 3)
        XCTAssertEqual(summary.oddCount, 1)
        XCTAssertEqual(summary.medianAdvantage ?? 0, 0.4, accuracy: 1e-9)
        XCTAssertEqual(summary.meanAdvantage ?? 0, (0.4 + 0.2 + 1.2) / 3, accuracy: 1e-9)
        XCTAssertEqual(summary.perYear.map { $0.year }, [2023, 2024])     // sorted ascending
        XCTAssertNil(OvertakeStats.circuitSummary([]))
    }

    func testLeaderboardTalliesMadeAndSuffered() {
        let driverMap = [1: Driver(driverNumber: 1, nameAcronym: "AAA"), 2: Driver(driverNumber: 2, nameAcronym: "BBB")]
        let raceOne = OvertakeResult(
            overtakes: [pass(3, 1, 2, delta: -0.3), pass(4, 1, 3, delta: -0.1)], driverMap: driverMap, maxLap: 50)
        let raceTwo = OvertakeResult(
            overtakes: [pass(6, 2, 1, delta: -0.5)], driverMap: [:], maxLap: 50)

        let rows = OvertakeStats.leaderboard([raceOne, raceTwo])
        XCTAssertEqual(rows.map { $0.driverNumber }, [1, 2, 3])          // by passes made, then number
        XCTAssertEqual(rows[0].made, 2)
        XCTAssertEqual(rows[0].suffered, 1)
        XCTAssertEqual(rows[0].net, 1)
        XCTAssertEqual(rows[0].driver?.nameAcronym, "AAA")
        XCTAssertEqual(rows[1].made, 1)
        XCTAssertEqual(rows[1].suffered, 1)
        XCTAssertEqual(rows[2].made, 0)
        XCTAssertEqual(rows[2].suffered, 1)
        XCTAssertNil(rows[2].driver)                                    // driver 3 never in a driver map
    }
}
