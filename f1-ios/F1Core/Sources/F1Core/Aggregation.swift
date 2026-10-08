import Foundation

/// Results of running overtake detection over many races.
public struct OvertakeBatch: Sendable {
    public let results: [Int: OvertakeResult]   // session key -> result
    public let failedKeys: [Int]                // races whose data could not be loaded
}

public extension OpenF1Client {
    /// The weekend's main Qualifying session. Sprint Qualifying shares the same
    /// session_type, so it is filtered out by name.
    func qualifyingSession(meetingKey: Int) async throws -> Session? {
        let all: [Session] = try await get(
            "sessions", ["meeting_key": String(meetingKey), "session_type": "Qualifying"])
        return all.first(where: Qualifying.isMainQualifying)
    }

    /// Every Grand Prix ever held at a circuit. The Sprint is filed under
    /// session_type "Race" too, so it is dropped by name.
    func raceSessions(atLocation location: String) async throws -> [Session] {
        let all: [Session] = try await get("sessions", ["location": location, "session_type": "Race"])
        return all.filter { Rounds.isMainRace($0) }
    }

    func overtakes(sessionKey: Int) async throws -> OvertakeResult {
        async let drivers = self.drivers(sessionKey: sessionKey)
        async let laps = self.laps(sessionKey: sessionKey)
        async let pits = self.pitStops(sessionKey: sessionKey)
        async let control = self.raceControl(sessionKey: sessionKey)
        let (d, l, p, c) = try await (drivers, laps, pits, control)
        return Overtakes.detect(drivers: d, laps: l, pitStops: p, raceControl: c)
    }

    /// Runs overtake detection for many races a few at a time (each race is ~4
    /// requests, so a season is dozens). A race that fails is recorded in
    /// `failedKeys` instead of aborting the whole batch — callers should surface
    /// that, since a silently shorter sample would bias the statistics.
    func overtakeBatch(
        sessionKeys: [Int],
        batchSize: Int = 3,
        onProgress: (@Sendable (_ done: Int, _ total: Int) -> Void)? = nil
    ) async throws -> OvertakeBatch {
        var results: [Int: OvertakeResult] = [:]
        var failed: [Int] = []
        var done = 0
        onProgress?(0, sessionKeys.count)

        var index = 0
        while index < sessionKeys.count {
            let chunk = Array(sessionKeys[index..<min(index + batchSize, sessionKeys.count)])
            index += batchSize

            try await withThrowingTaskGroup(of: (Int, OvertakeResult?).self) { group in
                for key in chunk {
                    group.addTask {
                        do {
                            return (key, try await self.overtakes(sessionKey: key))
                        } catch is CancellationError {
                            throw CancellationError()
                        } catch {
                            return (key, nil)
                        }
                    }
                }
                for try await (key, result) in group {
                    if let result { results[key] = result } else { failed.append(key) }
                    done += 1
                    onProgress?(done, sessionKeys.count)
                }
            }
        }
        return OvertakeBatch(results: results, failedKeys: failed.sorted())
    }
}
