import SwiftUI

struct RootView: View {
    @EnvironmentObject private var store: SessionStore

    var body: some View {
        VStack(spacing: 0) {
            SessionHeader()
            TabView {
                NavigationStack { OvertakesView(sessionKey: store.sessionKey) }
                    .tabItem { Label("Overtakes", systemImage: "arrow.triangle.swap") }
                NavigationStack { GapChartView(sessionKey: store.sessionKey) }
                    .tabItem { Label("Gaps", systemImage: "chart.xyaxis.line") }
                NavigationStack { PitStopsView(sessionKey: store.sessionKey) }
                    .tabItem { Label("Pit Stops", systemImage: "wrench.and.screwdriver") }
                NavigationStack { RaceControlView(sessionKey: store.sessionKey) }
                    .tabItem { Label("Race Control", systemImage: "flag.checkered") }
                NavigationStack { TeamRadioView(sessionKey: store.sessionKey) }
                    .tabItem { Label("Radio", systemImage: "waveform") }
                NavigationStack { QualifyingView(meetingKey: store.selectedRound?.meetingKey) }
                    .tabItem { Label("Qualifying", systemImage: "timer") }
                NavigationStack { InsightsView(round: store.selectedRound, year: store.year) }
                    .tabItem { Label("Insights", systemImage: "chart.bar.xaxis") }
            }
        }
        .task(id: store.year) { await store.loadRounds() }
    }
}

struct SessionHeader: View {
    @EnvironmentObject private var store: SessionStore

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Picker("Year", selection: $store.year) {
                    ForEach(store.years, id: \.self) { year in
                        Text(String(year)).tag(year)
                    }
                }
                .pickerStyle(.menu)

                if store.isLoadingRounds {
                    ProgressView()
                } else if store.rounds.isEmpty {
                    Text(store.roundsError ?? "No races yet")
                        .font(.footnote)
                        .foregroundStyle(store.roundsError == nil ? Color.secondary : Color.red)
                } else {
                    Picker("Race", selection: $store.selectedMeetingKey) {
                        ForEach(store.rounds) { round in
                            Text(round.sprintKey == nil ? round.location : "\(round.location) ★")
                                .tag(Optional(round.meetingKey))
                        }
                    }
                    .pickerStyle(.menu)
                }
                Spacer()
            }

            Picker("Session", selection: Binding(
                get: { store.isSprint },
                set: { store.wantsSprint = $0 }
            )) {
                Text("Race").tag(false)
                Text("Sprint").tag(true)
            }
            .pickerStyle(.segmented)
            .disabled(store.selectedRound?.sprintKey == nil)
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }
}
