import Foundation

public enum OpenF1Error: Error, LocalizedError {
    case http(status: Int)

    public var errorDescription: String? {
        switch self {
        case .http(let status): return "OpenF1 request failed with status \(status)"
        }
    }
}

/// Rate-limit-aware OpenF1 client. These behaviours were all learned the hard
/// way on the web dashboard:
///  - OpenF1's limit is stricter than it looks: cap concurrency AND stagger
///    request start times, or bursts trigger 429s even at low concurrency.
///  - Back off exponentially with random jitter, otherwise concurrent requests
///    that 429 together all retry at the same instant and re-burst.
///  - Honour Retry-After, and broadcast the pause so other queued requests wait.
///  - Share in-flight/cached responses so several screens asking for the same
///    data cost one request. Failures are evicted (the web version cached them).
public actor OpenF1Client {
    public static let shared = OpenF1Client()

    public struct Config: Sendable {
        public var maxConcurrent = 2
        public var requestGap: TimeInterval = 0.75
        public var maxRetries = 6
        public var cacheTTL: TimeInterval = 300
        public init() {}
    }

    private struct CacheEntry {
        let expires: Date
        let task: Task<Data, Error>
    }

    private let baseURL: URL
    private let urlSession: URLSession
    private let config: Config
    private let decoder = OpenF1Decoder.make()

    private var cache: [String: CacheEntry] = [:]
    private var active = 0
    private var waiters: [CheckedContinuation<Void, Never>] = []
    private var nextSlot = Date.distantPast
    private var rateLimitUntil = Date.distantPast

    public init(
        baseURL: URL = URL(string: "https://api.openf1.org/v1")!,
        urlSession: URLSession = .shared,
        config: Config = Config()
    ) {
        self.baseURL = baseURL
        self.urlSession = urlSession
        self.config = config
    }

    // MARK: Generic fetch

    public func get<T: Decodable>(_ path: String, _ params: [String: String] = [:]) async throws -> [T] {
        let key = Self.cacheKey(path, params)
        let now = Date()

        let task: Task<Data, Error>
        if let entry = cache[key], entry.expires > now {
            task = entry.task
        } else {
            task = Task { try await self.fetchWithRetry(path: path, params: params) }
            cache[key] = CacheEntry(expires: now.addingTimeInterval(config.cacheTTL), task: task)
        }

        do {
            let data = try await task.value
            return try decoder.decode([T].self, from: data)
        } catch {
            cache[key] = nil
            throw error
        }
    }

    static func cacheKey(_ path: String, _ params: [String: String]) -> String {
        let query = params.sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }.joined(separator: "&")
        return path + "?" + query
    }

    // MARK: Concurrency cap + staggered slots

    private func acquire() async {
        if active < config.maxConcurrent {
            active += 1
            return
        }
        // The slot is handed over by release(), so `active` is not incremented here.
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            waiters.append(continuation)
        }
    }

    private func release() {
        if waiters.isEmpty {
            active -= 1
        } else {
            waiters.removeFirst().resume()
        }
    }

    private func waitForSlot() async throws {
        let slot = max(nextSlot, Date())
        nextSlot = slot.addingTimeInterval(config.requestGap)
        let target = max(slot, rateLimitUntil)
        let delay = target.timeIntervalSince(Date())
        if delay > 0 {
            try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
        }
    }

    // MARK: Retry

    private func buildURL(path: String, params: [String: String]) -> URL {
        var components = URLComponents(
            url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !params.isEmpty {
            components.queryItems = params.sorted { $0.key < $1.key }
                .map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        return components.url!
    }

    private func sleepBeforeRetry(attempt: Int, retryAfter: TimeInterval?, is429: Bool) async throws {
        var base = pow(2.0, Double(attempt))          // 1, 2, 4, 8, ...
        if let retryAfter { base = max(base, retryAfter) }
        if is429 {
            rateLimitUntil = max(rateLimitUntil, Date().addingTimeInterval(base))
        }
        let jitter = Double.random(in: 0...base)
        try await Task.sleep(nanoseconds: UInt64((base + jitter) * 1_000_000_000))
    }

    private func fetchWithRetry(path: String, params: [String: String]) async throws -> Data {
        let url = buildURL(path: path, params: params)

        for attempt in 0...config.maxRetries {
            await acquire()
            let outcome: Result<(Data, HTTPURLResponse), Error>
            do {
                try await waitForSlot()
                let (data, response) = try await urlSession.data(from: url)
                guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
                outcome = .success((data, http))
            } catch {
                outcome = .failure(error)
            }
            release()

            let isLastAttempt = attempt == config.maxRetries

            switch outcome {
            case .success(let value):
                let (data, http) = value
                switch http.statusCode {
                case 200..<300:
                    return data
                case 404:
                    return Data("[]".utf8)          // OpenF1 uses 404 for "no results"
                case 429, 500...:
                    if isLastAttempt { throw OpenF1Error.http(status: http.statusCode) }
                    let retryAfter = http.value(forHTTPHeaderField: "Retry-After").flatMap { TimeInterval($0) }
                    try await sleepBeforeRetry(attempt: attempt, retryAfter: retryAfter, is429: http.statusCode == 429)
                default:
                    throw OpenF1Error.http(status: http.statusCode)
                }

            case .failure(let error):
                if error is CancellationError { throw error }
                if let urlError = error as? URLError, urlError.code == .cancelled { throw error }
                if isLastAttempt { throw error }
                try await sleepBeforeRetry(attempt: attempt, retryAfter: nil, is429: false)
            }
        }
        throw OpenF1Error.http(status: -1)   // unreachable: the loop returns or throws
    }
}

// MARK: - Endpoint helpers

public extension OpenF1Client {
    func sessions(year: Int, type: String) async throws -> [Session] {
        try await get("sessions", ["year": String(year), "session_type": type])
    }

    /// All Race-weekend sessions for a year. The Sprint race is filed under
    /// session_type "Race" (session_name is what distinguishes it), so both
    /// queries are merged and classified later by `Rounds.build`.
    func raceAndSprintSessions(year: Int) async throws -> [Session] {
        async let races = sessions(year: year, type: "Race")
        async let sprints = sessions(year: year, type: "Sprint")
        let (raceSessions, sprintSessions) = try await (races, sprints)
        var byKey: [Int: Session] = [:]
        for s in raceSessions + sprintSessions { byKey[s.sessionKey] = s }
        return Array(byKey.values)
    }

    func drivers(sessionKey: Int) async throws -> [Driver] {
        try await get("drivers", ["session_key": String(sessionKey)])
    }
    func laps(sessionKey: Int) async throws -> [Lap] {
        try await get("laps", ["session_key": String(sessionKey)])
    }
    func stints(sessionKey: Int) async throws -> [Stint] {
        try await get("stints", ["session_key": String(sessionKey)])
    }
    func pitStops(sessionKey: Int) async throws -> [PitStop] {
        try await get("pit", ["session_key": String(sessionKey)])
    }
    func positions(sessionKey: Int) async throws -> [PositionEntry] {
        try await get("position", ["session_key": String(sessionKey)])
    }
    func raceControl(sessionKey: Int) async throws -> [RaceControlMessage] {
        try await get("race_control", ["session_key": String(sessionKey)])
    }
    func teamRadio(sessionKey: Int) async throws -> [TeamRadioClip] {
        try await get("team_radio", ["session_key": String(sessionKey)])
    }
    /// ~3.7 Hz telemetry for one driver across the whole session. Large: fetch lazily.
    func carData(sessionKey: Int, driverNumber: Int) async throws -> [CarDatum] {
        try await get("car_data", ["session_key": String(sessionKey), "driver_number": String(driverNumber)])
    }
    func location(sessionKey: Int, driverNumber: Int) async throws -> [LocationSample] {
        try await get("location", ["session_key": String(sessionKey), "driver_number": String(driverNumber)])
    }
}
