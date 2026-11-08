// 홈·잠금 화면 위젯: 오늘 할 것 몇 줄과 체크칸. 체크는 위젯에서 바로(앱이 열릴 때 반영)
import WidgetKit
import SwiftUI
import AppIntents

struct ToggleItemIntent: AppIntent {
    static var title: LocalizedStringResource = "체크"
    @Parameter(title: "id") var id: String
    init() {}
    init(id: String) { self.id = id }
    func perform() async throws -> some IntentResult {
        if var t = SharedStore.loadToday(), let i = t.items.firstIndex(where: { $0.id == id }) {
            t.items[i].done.toggle(); SharedStore.saveToday(t); SharedStore.pushCheck(id)
        }
        return .result()
    }
}

struct Entry: TimelineEntry { let date: Date; let today: SharedStore.Today? }

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry { Entry(date: Date(), today: SharedStore.Today(date: "", items: [.init(id: "a", title: "오늘 할 것", done: false)], first: nil)) }
    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { completion(Entry(date: Date(), today: SharedStore.loadToday())) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        completion(Timeline(entries: [Entry(date: Date(), today: SharedStore.loadToday())], policy: .after(next)))
    }
}

let navy = Color(red: 0x1E/255, green: 0x2F/255, blue: 0x4F/255)
let paper = Color(red: 0xFC/255, green: 0xFB/255, blue: 0xF7/255)
let checkRed = Color(red: 0xD7/255, green: 0x45/255, blue: 0x2E/255)
let rule = Color(red: 0xC8/255, green: 0xD6/255, blue: 0xE6/255)

struct Row: View {
    let item: SharedStore.Item
    var body: some View {
        Button(intent: ToggleItemIntent(id: item.id)) {
            HStack(spacing: 8) {
                ZStack {
                    RoundedRectangle(cornerRadius: 3).stroke(navy.opacity(0.45), lineWidth: 1.2).frame(width: 15, height: 15)
                    if item.done { Image(systemName: "checkmark").font(.system(size: 11, weight: .heavy)).foregroundColor(checkRed) }
                }
                Text(item.title).font(.system(size: 13, weight: .semibold)).foregroundColor(item.done ? navy.opacity(0.35) : navy)
                    .strikethrough(item.done, color: checkRed).lineLimit(1)
                Spacer(minLength: 0)
            }
        }.buttonStyle(.plain)
    }
}

struct DualWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: Entry
    var items: [SharedStore.Item] {
        guard let t = entry.today else { return [] }
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        return t.date == f.string(from: Date()) ? t.items : []
    }
    var body: some View {
        switch family {
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                Text("오늘 \(items.filter { $0.done }.count)/\(items.count)").font(.system(size: 12, weight: .bold))
                ForEach(items.prefix(2), id: \.id) { i in Text((i.done ? "✓ " : "□ ") + i.title).font(.system(size: 12)).lineLimit(1) }
            }
        default:
            let n = family == .systemSmall ? 4 : 5
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("오늘").font(.system(size: 12, weight: .heavy)).foregroundColor(navy)
                    Spacer()
                    Text("\(items.filter { $0.done }.count)/\(items.count)").font(.system(size: 11, weight: .semibold).monospacedDigit()).foregroundColor(navy.opacity(0.5))
                }.padding(.bottom, 6)
                if items.isEmpty {
                    Text(entry.today?.first.flatMap { $0.isEmpty ? nil : $0 } ?? "앱에서 오늘 할 것 적기").font(.system(size: 13)).foregroundColor(navy.opacity(0.5))
                } else {
                    ForEach(items.prefix(n), id: \.id) { i in
                        Row(item: i).padding(.vertical, 4)
                        Rectangle().fill(rule).frame(height: 0.5)
                    }
                }
                Spacer(minLength: 0)
            }
        }
    }
}

@main
struct DualWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "DualToday", provider: Provider()) { e in
            DualWidgetView(entry: e).containerBackground(for: .widget) { paper }
        }
        .configurationDisplayName("DUAL 오늘")
        .description("오늘 할 것과 체크칸")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}
