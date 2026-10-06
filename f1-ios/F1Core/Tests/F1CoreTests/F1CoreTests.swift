import XCTest
@testable import F1Core

// MARK: - Helpers

private func t(_ seconds: Double) -> Date { Date(timeIntervalSince1970: 1_700_000_000 + seconds) }

private func msg(lap: Int?, flag: String? = nil, message: String? = nil, at seconds: Double = 0, category: String? = nil) -> RaceControlMessage {
    RaceControlMessage(date: t(seconds), lapNumber: lap, category: category, flag: flag, message: message)
}

final class DateParsingTests: XCTestCase {
    func testParsesMicrosecondFractionAndOffset() throws {
        let date = try XCTUnwrap(OpenF1Dates.parse("2023-09-15T09:30:43.123456+00:00"))
        let reference = try XCTUnwrap(OpenF1Dates.parse("2023-09-15T09:30:43+00:00"))
        XCTAssertEqual(date.timeIntervalSince(reference), 0.123, accuracy: 0.002)
    }

    func testParsesNoFraction() {
        XCTAssertNotNil(OpenF1Dates.parse("2023-09-15T09:30:43+00:00"))
        XCTAssertNotNil(OpenF1Dates.parse("2023-09-15T09:30:43Z"))
    }

    func testRejectsGarbage() {
        XCTAssertNil(OpenF1Dates.parse("not a date"))
    }

    func testDecodesSnakeCaseModels() throws {
        let json = """
        [{"session_key": 9158, "meeting_key": 1217, "session_name": "Sprint",
          "session_type": "Race", "location": "Monza", "year": 2023,
          "date_start": "2023-09-02T14:30:00.123000+00:00"}]
        """.data(using: .utf8)!
        let sessions = try OpenF1Decoder.make().decode([Session].self, from: json)
        XCTAssertEqual(sessions.first?.sessionKey, 9158)
        XCTAssertEqual(sessions.first?.sessionName, "Sprint")
        XCTAssertNotNil(sessions.first?.dateStart)
    }

    func testMissingOptionalFieldsDoNotFailDecode() throws {
        let json = #"[{"driver_number": 1, "lap_number": 3}]"#.data(using: .utf8)!
        let laps = try OpenF1Decoder.make().decode([Lap].self, from: json)
        XCTAssertEqual(laps.count, 1)
        XCTAssertNil(laps[0].lapDuration)
    }
}

// MARK: - Safety car

final class SafetyCarTests: XCTestCase {
    func testFlagStyleMessages() {
        let periods = safetyCarPeriods([
            msg(lap: 10, flag: "SC DEPLOYED"),
            msg(lap: 13, flag: "SC ENDING"),
        ], maxLap: 50)
        XCTAssertEqual(periods, [CautionPeriod(type: .sc, start: 10, end: 13)])
    }

    func testRealOpenF1MessageStyle() {
        // flag is empty; the text lives in `message`
        let periods = safetyCarPeriods([
            msg(lap: 20, message: "SAFETY CAR DEPLOYED", category: "SafetyCar"),
            msg(lap: 23, message: "SAFETY CAR IN THIS LAP", category: "SafetyCar"),
            msg(lap: 30, message: "VIRTUAL SAFETY CAR DEPLOYED", category: "SafetyCar"),
            msg(lap: 31, message: "VIRTUAL SAFETY CAR ENDING", category: "SafetyCar"),
        ], maxLap: 50)
        XCTAssertEqual(periods, [
            CautionPeriod(type: .sc, start: 20, end: 23),
            CautionPeriod(type: .vsc, start: 30, end: 31),
        ])
    }

    func testDeployedAndEndingOnSameLapKeepOrder() {
        let periods = safetyCarPeriods([
            msg(lap: 7, flag: "SAFETY CAR ENDING", at: 2),
            msg(lap: 7, flag: "SAFETY CAR DEPLOYED", at: 1),
        ], maxLap: 10)
        // DEPLOYED is earlier by timestamp, so the pair resolves even if delivered out of order.
        XCTAssertEqual(periods, [CautionPeriod(type: .sc, start: 7, end: 7)])
    }

    func testUnendedPeriodRunsToMaxLap() {
        let periods = safetyCarPeriods([msg(lap: 40, message: "SAFETY CAR DEPLOYED")], maxLap: 52)
        XCTAssertEqual(periods, [CautionPeriod(type: .sc, start: 40, end: 52)])
    }

    func testVirtualEndingDoesNotCloseARealSafetyCar() {
        let periods = safetyCarPeriods([
            msg(lap: 5, message: "SAFETY CAR DEPLOYED"),
            msg(lap: 6, message: "VIRTUAL SAFETY CAR ENDING"),   // stray VSC message, no VSC active
        ], maxLap: 20)
        XCTAssertEqual(periods, [CautionPeriod(type: .sc, start: 5, end: 20)])
    }

    func testNoMessages() {
        XCTAssertTrue(safetyCarPeriods([], maxLap: 10).isEmpty)
    }
}

// MARK: - Overtakes

final class OvertakeTests: XCTestCase {
    private func laps(_ driver: Int, _ times: [Double]) -> [Lap] {
        times.enumerated().map { Lap(driverNumber: driver, lapNumber: $0.offset + 1, lapDuration: $0.element) }
    }

    /// Same scenario as the web app's synthetic test: one clean pass (lap 3), a
    /// pit-stop position swap, a Safety Car lap, grid order on lap 1, and a lead
    /// change on lap 8.
    func testDetectsCleanPassesAndExcludesNoise() {
        let base = 92.0
        let allLaps: [Lap] = [
            laps(1, [92, 92, 92, 92, 92, 92, 92, 92]),
            laps(2, [93, 93, 93, 93, 119, 93, 93, 93]),
            laps(3, [92.5, 92.5, 92.3, 92, 117, 92, 92, 92]),
            laps(4, [92.5, 92.8, base - 0.3, 92, 92, 92, 92, base - 2]),
        ].flatMap { $0 }

        let result = Overtakes.detect(
            drivers: [1, 2, 3, 4].map { Driver(driverNumber: $0, nameAcronym: "D\($0)") },
            laps: allLaps,
            pitStops: [PitStop(driverNumber: 2, lapNumber: 5), PitStop(driverNumber: 3, lapNumber: 5)],
            raceControl: [
                msg(lap: 7, message: "SAFETY CAR DEPLOYED", at: 1),
                msg(lap: 7, message: "SAFETY CAR IN THIS LAP", at: 2),
            ]
        )

        XCTAssertEqual(result.overtakes.count, 2)

        let first = result.overtakes.first { $0.lap == 3 }
        XCTAssertEqual(first?.attacker, 4)
        XCTAssertEqual(first?.defender, 3)
        XCTAssertEqual(first?.paceDelta ?? 0, -0.6, accuracy: 0.001)
        XCTAssertEqual(first?.gapBefore ?? 0, 0.3, accuracy: 0.001)

        let second = result.overtakes.first { $0.lap == 8 }
        XCTAssertEqual(second?.attacker, 4)
        XCTAssertEqual(second?.defender, 1)
        XCTAssertEqual(second?.posAfter, 1)
        XCTAssertEqual(second?.paceDelta ?? 0, -2.0, accuracy: 0.001)
        XCTAssertEqual(second?.gapBefore ?? 0, 1.0, accuracy: 0.001)

        XCTAssertFalse(result.overtakes.contains { $0.attacker == 2 || $0.defender == 2 })
        XCTAssertFalse(result.overtakes.contains { $0.lap == 7 })
        XCTAssertFalse(result.overtakes.contains { $0.lap == 1 })
    }

    func testEmptyAndSingleLapInputsDoNotCrash() {
        XCTAssertTrue(Overtakes.detect(drivers: [], laps: [], pitStops: [], raceControl: []).overtakes.isEmpty)
        let oneLap = [Lap(driverNumber: 1, lapNumber: 1, lapDuration: 90),
                      Lap(driverNumber: 2, lapNumber: 1, lapDuration: 91)]
        XCTAssertTrue(Overtakes.detect(drivers: [], laps: oneLap, pitStops: [], raceControl: []).overtakes.isEmpty)
    }

    func testRetiredDriverIsNotCountedAsPassed() {
        // Driver 2 stops after lap 3; driver 3 moves up a place without passing anyone.
        let allLaps: [Lap] = [
            laps(1, [90, 90, 90, 90, 90]),
            laps(2, [91, 91, 91]),
            laps(3, [92, 92, 92, 92, 92]),
        ].flatMap { $0 }
        let result = Overtakes.detect(drivers: [], laps: allLaps, pitStops: [], raceControl: [])
        XCTAssertTrue(result.overtakes.isEmpty)
    }
}

// MARK: - Race timing

final class RaceTimingTests: XCTestCase {
    func testGapToLeader() {
        let laps = [
            Lap(driverNumber: 1, lapNumber: 1, lapDuration: 90),
            Lap(driverNumber: 2, lapNumber: 1, lapDuration: 91),
            Lap(driverNumber: 1, lapNumber: 2, lapDuration: 90),
            Lap(driverNumber: 2, lapNumber: 2, lapDuration: 89),
        ]
        let gaps = RaceTiming(laps: laps).gapToLeader()
        XCTAssertEqual(gaps[1]?[1] ?? -1, 0, accuracy: 1e-9)
        XCTAssertEqual(gaps[2]?[1] ?? -1, 1, accuracy: 1e-9)
        XCTAssertEqual(gaps[2]?[2] ?? -1, 0, accuracy: 1e-9)   // driver 2 took the lead on aggregate
        XCTAssertEqual(gaps[1]?[2] ?? -1, 0, accuracy: 1e-9)
    }

    func testEmpty() {
        XCTAssertTrue(RaceTiming(laps: []).gapToLeader().isEmpty)
    }
}

// MARK: - Rounds (Race vs Sprint)

final class RoundsTests: XCTestCase {
    private func session(_ key: Int, meeting: Int, name: String, type: String, day: Double) -> Session {
        Session(sessionKey: key, meetingKey: meeting, sessionName: name, sessionType: type,
                location: "Monza", dateStart: Date(timeIntervalSince1970: 1_600_000_000 + day * 86_400))
    }

    func testSprintFiledUnderRaceTypeIsNotMistakenForTheRace() {
        // OpenF1 quirk: the Sprint has session_type "Race" and sorts before Sunday's race.
        let sessions = [
            session(1, meeting: 100, name: "Sprint", type: "Race", day: 1),
            session(2, meeting: 100, name: "Race", type: "Race", day: 2),
            session(3, meeting: 100, name: "Sprint Qualifying", type: "Qualifying", day: 0),
            session(4, meeting: 200, name: "Race", type: "Race", day: 9),
        ]
        let rounds = Rounds.build(sessions: sessions, now: Date(timeIntervalSince1970: 1_700_000_000))
        XCTAssertEqual(rounds.map { $0.raceKey }, [2, 4])
        XCTAssertEqual(rounds.first?.sprintKey, 1)
        XCTAssertNil(rounds.last?.sprintKey)
    }

    func testFutureRacesExcluded() {
        let sessions = [session(1, meeting: 1, name: "Race", type: "Race", day: 100_000)]
        XCTAssertTrue(Rounds.build(sessions: sessions, now: Date(timeIntervalSince1970: 1_700_000_000)).isEmpty)
    }
}

// MARK: - Telemetry, zones, box time, dominance

final class TelemetryTests: XCTestCase {
    private func lerp(_ a: Double, _ b: Double, _ f: Double) -> Double { a + (b - a) * f }

    /// Samples every `step` metres along a segment with linearly varying speed/throttle.
    private func segment(_ d0: Double, _ d1: Double, speed s0: Double, _ s1: Double,
                         throttle t0: Double, _ t1: Double, brake: Bool, drs: Int = 0, step: Double = 20) -> [TelemetrySample] {
        stride(from: d0, to: d1, by: step).map { d in
            let f = (d - d0) / (d1 - d0)
            return TelemetrySample(speed: lerp(s0, s1, f), throttle: lerp(t0, t1, f).rounded(),
                                   brake: brake, drs: drs, dist: d)
        }
    }

    /// Fast driver: brakes late, carries more apex speed, DRS open on the first two straights.
    private var driverA: [TelemetrySample] {
        let parts: [[TelemetrySample]] = [
            segment(0, 750, speed: 180, 330, throttle: 100, 100, brake: false, drs: 12),
            segment(750, 820, speed: 330, 140, throttle: 0, 0, brake: true),
            segment(820, 900, speed: 140, 200, throttle: 0, 100, brake: false),
            segment(900, 1600, speed: 200, 340, throttle: 100, 100, brake: false, drs: 12),
            segment(1600, 1650, speed: 340, 110, throttle: 0, 0, brake: true),
            segment(1650, 1700, speed: 110, 180, throttle: 0, 100, brake: false),
            segment(1700, 2200, speed: 180, 320, throttle: 100, 100, brake: false),
        ]
        return parts.flatMap { $0 }
    }

    /// Slower driver: brakes earlier, lower apex speeds, no DRS.
    private var driverB: [TelemetrySample] {
        let parts: [[TelemetrySample]] = [
            segment(0, 700, speed: 178, 325, throttle: 100, 100, brake: false),
            segment(700, 815, speed: 325, 130, throttle: 0, 0, brake: true),
            segment(815, 900, speed: 130, 195, throttle: 0, 100, brake: false),
            segment(900, 1590, speed: 195, 336, throttle: 100, 100, brake: false),
            segment(1590, 1645, speed: 336, 100, throttle: 0, 0, brake: true),
            segment(1645, 1700, speed: 100, 175, throttle: 0, 100, brake: false),
            segment(1700, 2200, speed: 175, 315, throttle: 100, 100, brake: false),
        ]
        return parts.flatMap { $0 }
    }

    func testDetectsFiveZonesWithoutFragmenting() {
        let zones = Zones.detect(driverA)
        XCTAssertEqual(zones.map { $0.label }, ["S1", "C1", "S2", "C2", "S3"])
        XCTAssertEqual(zones.map { $0.type }, [.straight, .corner, .straight, .corner, .straight])
    }

    func testThrottleLiftBlipIsAbsorbed() {
        let straight = segment(0, 400, speed: 200, 280, throttle: 100, 100, brake: false, step: 10)
        let blip = [TelemetrySample(speed: 279, throttle: 60, dist: 405),
                    TelemetrySample(speed: 278, throttle: 40, dist: 415)]
        let rest = segment(425, 800, speed: 280, 330, throttle: 100, 100, brake: false, step: 10)
        XCTAssertEqual(Zones.detect(straight + blip + rest).count, 1)
    }

    func testZoneSummaryComparesDrivers() {
        let zones = Zones.detect(driverA)
        let summary = Zones.summarize(zones: zones, telemetry: [1: driverA, 2: driverB])
        let c1 = summary[1].perDriver
        XCTAssertEqual(c1[1]?.apexSpeed ?? 0, 140, accuracy: 15)
        XCTAssertEqual(c1[2]?.apexSpeed ?? 0, 130, accuracy: 15)
        XCTAssertGreaterThan(c1[1]?.apexSpeed ?? 0, c1[2]?.apexSpeed ?? 0)
        XCTAssertEqual(summary[0].perDriver[1]?.drs, true)
        XCTAssertEqual(summary[0].perDriver[2]?.drs, false)
    }

    func testAddDistanceIntegratesSpeed() {
        // 36 km/h = 10 m/s for 5 s -> 50 m
        let samples = [TelemetrySample(elapsed: 0, speed: 36), TelemetrySample(elapsed: 5, speed: 36)]
        let withDistance = Telemetry.addDistance(samples)
        XCTAssertEqual(withDistance.last?.dist ?? 0, 50, accuracy: 1e-9)
        XCTAssertTrue(Telemetry.addDistance([]).isEmpty)
    }

    func testInterpolation() {
        let samples = [TelemetrySample(elapsed: 0, dist: 0), TelemetrySample(elapsed: 10, dist: 100)]
        XCTAssertEqual(Telemetry.interpolate(samples, atDistance: 25) { $0.elapsed }, 2.5, accuracy: 1e-9)
        XCTAssertEqual(Telemetry.interpolate(samples, atDistance: -5) { $0.elapsed }, 0, accuracy: 1e-9)
        XCTAssertEqual(Telemetry.interpolate([], atDistance: 5) { $0.elapsed }, 0)
    }

    func testBoxTimeFindsStationaryWindow() throws {
        let pit = t(100)
        // ~3.7 Hz samples (every 0.27 s); stationary from +8.0 s to +10.7 s after the pit timestamp.
        // On that sample grid the first/last stationary samples are 9 intervals apart = 2.43 s.
        var data: [CarDatum] = []
        var offset = -3.0
        while offset < 25 {
            let stationary = offset >= 8.0 && offset <= 10.7
            data.append(CarDatum(date: t(100 + offset), speed: stationary ? 0 : 90))
            offset += 0.27
        }
        let box = try XCTUnwrap(BoxTime.calculate(carData: data, pitDate: pit, pitDuration: 22))
        XCTAssertEqual(box, 2.43, accuracy: 0.05)
    }

    func testBoxTimeNilWhenNeverStationary() {
        let data = (0..<50).map { CarDatum(date: t(Double($0) * 0.27), speed: 80) }
        XCTAssertNil(BoxTime.calculate(carData: data, pitDate: t(5), pitDuration: 20))
    }

    func testTrackDominanceAssignsEachHalfToTheFasterDriver() throws {
        func tel(_ length: Double, _ speed: (Double) -> Double) -> [TelemetrySample] {
            var out: [TelemetrySample] = []
            var elapsed = 0.0
            var d = 0.0
            while d <= length {
                if d > 0 { elapsed += 5 / speed(d) }
                out.append(TelemetrySample(elapsed: elapsed, dist: d))
                d += 5
            }
            return out
        }
        let telemetry: [Int: [TelemetrySample]] = [
            1: tel(1000) { $0 < 500 ? 50 : 40 },
            2: tel(1010) { $0 < 505 ? 40 : 50 },      // 1% longer integrated distance
            3: tel(1000) { _ in 42 },
        ]
        let line = stride(from: 0.0, through: 1000.0, by: 10.0).map { GPSPoint(x: $0, y: 0, dist: $0) }
        let result = TrackDominance.compute(
            telemetry: telemetry,
            paths: [1: line, 2: line, 3: line],
            lapTimes: [1: 90, 2: 91, 3: 92]
        )
        let r = try XCTUnwrap(result)
        XCTAssertEqual(r.referenceDriver, 1)
        XCTAssertEqual(r.sectors.count, 25)
        XCTAssertTrue(r.sectors.prefix(12).allSatisfy { $0.fastest == 1 })
        XCTAssertTrue(r.sectors.suffix(12).allSatisfy { $0.fastest == 2 })
        XCTAssertEqual(r.shares.first { $0.driver == 3 }?.percent, 0)
    }

    func testTrackDominanceNeedsTwoDrivers() {
        let line = [GPSPoint(x: 0, y: 0, dist: 0), GPSPoint(x: 1, y: 0, dist: 1)]
        let tel = [TelemetrySample(elapsed: 0, dist: 0), TelemetrySample(elapsed: 1, dist: 10)]
        XCTAssertNil(TrackDominance.compute(telemetry: [1: tel], paths: [1: line], lapTimes: [1: 90]))
    }
}
