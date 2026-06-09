import SwiftUI

/// Starter Core-UI component (L3 — domain-blind). The Components/ folder grows at kickoff;
/// every component here uses tokens only and knows nothing about the domain.
public struct DSCard<Content: View>: View {
    private let content: Content

    public init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    public var body: some View {
        content
            .padding(DS.Padding.m)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.DS.surface, in: RoundedRectangle(cornerRadius: DS.Radius.m))
            .overlay(
                RoundedRectangle(cornerRadius: DS.Radius.m)
                    .stroke(Color.DS.stroke, lineWidth: DS.Size.hairline)
            )
    }
}
