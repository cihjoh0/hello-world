import SwiftUI

enum LoadState<Value> {
    case idle
    case loading
    case loaded(Value)
    case failed(String)
}

/// Standard loading / error / content wrapper shared by every panel.
struct LoadStateView<Value, Content: View>: View {
    let state: LoadState<Value>
    let content: (Value) -> Content

    init(_ state: LoadState<Value>, @ViewBuilder content: @escaping (Value) -> Content) {
        self.state = state
        self.content = content
    }

    var body: some View {
        switch state {
        case .idle, .loading:
            ProgressView()
                .frame(maxWidth: .infinity, minHeight: 160)
        case .failed(let message):
            VStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle")
                Text(message).multilineTextAlignment(.center)
            }
            .foregroundStyle(Color.red)
            .frame(maxWidth: .infinity, minHeight: 120)
            .padding()
        case .loaded(let value):
            content(value)
        }
    }
}

extension Color {
    /// OpenF1 team colours are 6-digit hex strings without a leading "#".
    init(teamHex: String?) {
        guard let hex = teamHex, hex.count == 6, let value = UInt32(hex, radix: 16) else {
            self = .gray
            return
        }
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}
