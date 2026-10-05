import Foundation

public enum CautionType: String, Hashable, Sendable {
    case sc = "SC"
    case vsc = "VSC"
}

public struct CautionPeriod: Hashable, Sendable {
    public let type: CautionType
    public let start: Int
    public let end: Int
}

/// Parses Safety Car / VSC periods (as lap ranges) from race control messages.
///
/// Matches against BOTH `flag` and `message`: OpenF1 reports these events with
/// category "SafetyCar" and a message like "SAFETY CAR DEPLOYED" (flag is
/// typically empty for them), while some feeds put "SC DEPLOYED" in the flag.
/// A period that is deployed but never explicitly ended runs to `maxLap`.
public func safetyCarPeriods(_ messages: [RaceControlMessage], maxLap: Int?) -> [CautionPeriod] {
    var periods: [CautionPeriod] = []
    var scStart: Int?
    var vscStart: Int?

    // Sort by lap, then timestamp, then original order — Swift's sort is not
    // guaranteed stable and DEPLOYED/ENDING can share a lap.
    let ordered = messages.enumerated().sorted { a, b in
        let la = a.element.lapNumber ?? 0, lb = b.element.lapNumber ?? 0
        if la != lb { return la < lb }
        if a.element.date != b.element.date { return a.element.date < b.element.date }
        return a.offset < b.offset
    }.map { $0.element }

    func has(_ text: String, _ needles: [String]) -> Bool {
        needles.contains { text.contains($0) }
    }

    for msg in ordered {
        guard let lap = msg.lapNumber, lap > 0 else { continue }
        let text = "\(msg.flag ?? "") \(msg.message ?? "")".uppercased()
        let isVirtual = text.contains("VIRTUAL") || text.contains("VSC")

        // "SC DEPLOYED"/"SC ENDING" are substrings of the VSC phrases, so VSC is
        // handled first and the SC branches exclude anything virtual.
        if has(text, ["VIRTUAL SAFETY CAR DEPLOYED", "VSC DEPLOYED"]) {
            vscStart = lap
        } else if has(text, ["VIRTUAL SAFETY CAR ENDING", "VSC ENDING"]), let start = vscStart {
            periods.append(CautionPeriod(type: .vsc, start: start, end: lap))
            vscStart = nil
        } else if !isVirtual, has(text, ["SAFETY CAR DEPLOYED", "SC DEPLOYED"]) {
            scStart = lap
        } else if !isVirtual, has(text, ["SAFETY CAR IN THIS LAP", "SAFETY CAR ENDING", "SC ENDING"]), let start = scStart {
            periods.append(CautionPeriod(type: .sc, start: start, end: lap))
            scStart = nil
        }
    }

    if let maxLap {
        if let start = scStart { periods.append(CautionPeriod(type: .sc, start: start, end: maxLap)) }
        if let start = vscStart { periods.append(CautionPeriod(type: .vsc, start: start, end: maxLap)) }
    }
    return periods
}
