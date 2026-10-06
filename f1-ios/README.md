# F1 Analytics — iOS

Native SwiftUI port of the web dashboard in `../f1-dashboard`, using the same
[OpenF1](https://openf1.org) data and the same algorithms.

> **Status: written without a Swift toolchain — never compiled or run.**
> It was authored in a Linux sandbox with no Swift, Xcode, or network access to
> install one. Expect to fix a few compile errors on first build. The pure
> logic is covered by unit tests ported from scenarios already validated against
> the JavaScript version; **run `swift test` first.**

## Layout

```
F1Core/   Swift package — models, rate-limited OpenF1 client, all algorithms, tests
F1App/    SwiftUI sources for the app target
```

`F1Core` is pure Foundation (no UI), so the logic can be tested on macOS without
a simulator.

| File | What it ports |
|---|---|
| `OpenF1Client.swift` | Actor with concurrency cap, staggered request slots, exponential backoff **with jitter**, `Retry-After`, shared in-flight/cached responses (failures are evicted) |
| `SafetyCar.swift` | Safety Car / VSC period parsing |
| `RaceTiming.swift` | Cumulative race time, ranking per lap, gap to leader |
| `Overtakes.swift` | On-track pass detection (pit, Safety Car and lap-1 laps excluded) |
| `Rounds.swift` | Race weekends; classifies Sprint vs Race by `session_name` (OpenF1 files the Sprint under `session_type` "Race") |
| `Telemetry.swift`, `Zones.swift` | Speed→distance integration, interpolation, straight/corner zones, pit-stop box (stationary) time |
| `TrackDominance.swift` | Per-mini-sector fastest driver |

## Running it

1. On a Mac: `cd F1Core && swift test`
2. Xcode → **File ▸ New ▸ Project ▸ iOS App** (SwiftUI, iOS 16+), named e.g. `F1Analytics`.
3. **File ▸ Add Package Dependencies ▸ Add Local…** → choose `F1Core`, add the `F1Core` library to the app target.
4. Delete the template `App`/`ContentView` files and drag in everything from `F1App/`.
5. Build and run.

## What's in the app vs. only in `F1Core`

In the app: Overtakes, Gap-to-leader chart (with Safety Car / VSC bands), Pit Stops
(with on-demand box time), Race Control feed.

In `F1Core` with tests but **no UI yet**: straights-vs-corners zones, track
dominance, GPS path helpers. Not ported at all: team radio playback, weekend
pace, qualifying telemetry charts, circuit overtake history, season leaderboard,
storylines, the FastF1 panel.
