import Foundation

// MARK: - Date parsing

/// OpenF1 timestamps look like "2023-09-15T09:30:43.123000+00:00" — microsecond
/// fractions, which ISO8601DateFormatter does not reliably accept. Try the strict
/// parse first, then fall back to trimming the fraction to milliseconds.
enum OpenF1Dates {
    private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let plain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static func parse(_ string: String) -> Date? {
        if let d = withFraction.date(from: string) { return d }
        if let d = plain.date(from: string) { return d }

        guard let dot = string.firstIndex(of: ".") else { return nil }
        let tail = string[dot...]
        guard let tzIndex = tail.firstIndex(where: { $0 == "+" || $0 == "-" || $0 == "Z" }) else { return nil }
        let fraction = string[string.index(after: dot)..<tzIndex]
        let millis = String(fraction.prefix(3)).padding(toLength: 3, withPad: "0", startingAt: 0)
        let rebuilt = String(string[..<dot]) + "." + millis + String(string[tzIndex...])
        return withFraction.date(from: rebuilt)
    }
}

public enum OpenF1Decoder {
    public static func make() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let string = try container.decode(String.self)
            if let date = OpenF1Dates.parse(string) { return date }
            throw DecodingError.dataCorruptedError(
                in: container, debugDescription: "Unrecognised OpenF1 date: \(string)")
        }
        return decoder
    }
}

// MARK: - Models
//
// Required identity fields are `let`; everything else is an optional `var` so
// that (a) a missing field in an API response never fails the whole decode and
// (b) the synthesized memberwise initialiser lets tests omit irrelevant fields.

public struct Session: Codable, Identifiable, Hashable, Sendable {
    public let sessionKey: Int
    public let meetingKey: Int
    public var sessionName: String?
    public var sessionType: String?
    public var location: String?
    public var countryName: String?
    public var circuitShortName: String?
    public var year: Int?
    public var dateStart: Date?
    public var id: Int { sessionKey }
}

public struct Driver: Codable, Identifiable, Hashable, Sendable {
    public let driverNumber: Int
    public var nameAcronym: String?
    public var fullName: String?
    public var teamName: String?
    public var teamColour: String?
    public var id: Int { driverNumber }
}

public struct Lap: Codable, Hashable, Sendable {
    public let driverNumber: Int
    public let lapNumber: Int
    public var lapDuration: Double?
    public var dateStart: Date?
    public var durationSector1: Double?
    public var durationSector2: Double?
    public var durationSector3: Double?
    public var isPitOutLap: Bool?
}

public struct Stint: Codable, Hashable, Sendable {
    public let driverNumber: Int
    public var stintNumber: Int?
    public var lapStart: Int?
    public var lapEnd: Int?
    public var compound: String?
    public var tyreAgeAtStart: Int?
}

public struct PitStop: Codable, Hashable, Sendable {
    public let driverNumber: Int
    public var lapNumber: Int?
    public var pitDuration: Double?
    public var date: Date?
}

public struct PositionEntry: Codable, Hashable, Sendable {
    public let driverNumber: Int
    public var position: Int?
    public var date: Date?
}

public struct RaceControlMessage: Codable, Hashable, Sendable {
    public let date: Date
    public var lapNumber: Int?
    public var category: String?
    public var flag: String?
    public var message: String?
    public var driverNumber: Int?
    public var scope: String?
}

public struct TeamRadioClip: Codable, Hashable, Sendable {
    public let driverNumber: Int
    public let date: Date
    public var recordingUrl: String?
}

public struct CarDatum: Codable, Hashable, Sendable {
    public let date: Date
    public var speed: Int?
    public var throttle: Int?
    public var brake: Int?
    public var nGear: Int?
    public var rpm: Int?
    public var drs: Int?
}

public struct LocationSample: Codable, Hashable, Sendable {
    public let date: Date
    public var x: Double?
    public var y: Double?
    public var z: Double?
}
