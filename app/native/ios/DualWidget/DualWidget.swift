// 홈·잠금 화면 위젯: 오늘 할 것 몇 줄과 체크칸. 체크는 위젯에서 바로(앱이 열릴 때 반영)
// 「적기」를 누르면 앱이 적는 칸으로 열린다(dualplanner://write)
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

// 곧 마감 줄의 [오늘로]: 그 일을 오늘 할 것으로 올린다(앱이 열릴 때 반영)
struct PickTodayIntent: AppIntent {
    static var title: LocalizedStringResource = "오늘로"
    @Parameter(title: "id") var id: String
    init() {}
    init(id: String) { self.id = id }
    func perform() async throws -> some IntentResult {
        if var t = SharedStore.loadToday(), var soon = t.soon, let i = soon.firstIndex(where: { $0.id == id }) {
            let s = soon.remove(at: i)
            t.soon = soon; t.items.append(SharedStore.Item(id: s.id, title: s.title, done: false))
            SharedStore.saveToday(t); SharedStore.pushPick(id)
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
let writeURL = URL(string: "dualplanner://write")!

struct WriteLabel: View {
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "square.and.pencil").font(.system(size: 11, weight: .bold))
            Text("적기").font(.system(size: 12, weight: .heavy))
        }
        .foregroundColor(paper)
        .padding(.horizontal, 10).padding(.vertical, 4)
        .background(Capsule().fill(navy))
    }
}

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

// 마감까지 남은 날: 오늘 / D-n / 지남
func dueLabel(_ due: String) -> String {
    let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = .current
    guard let d = f.date(from: due) else { return "" }
    let cal = Calendar.current
    let n = cal.dateComponents([.day], from: cal.startOfDay(for: Date()), to: cal.startOfDay(for: d)).day ?? 0
    return n < 0 ? "지남" : n == 0 ? "오늘" : "D-\(n)"
}

struct SoonRow: View {
    let s: SharedStore.Soon
    let canPick: Bool
    var body: some View {
        HStack(spacing: 6) {
            Text(dueLabel(s.due)).font(.system(size: 10, weight: .heavy)).foregroundColor(checkRed)
            Text(s.title).font(.system(size: 12, weight: .medium)).foregroundColor(navy.opacity(0.8)).lineLimit(1)
            Spacer(minLength: 0)
            if canPick {
                Button(intent: PickTodayIntent(id: s.id)) {
                    Text("오늘로").font(.system(size: 10, weight: .bold)).foregroundColor(navy)
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .overlay(Capsule().stroke(navy.opacity(0.5), lineWidth: 1))
                }.buttonStyle(.plain)
            }
        }
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
    // 곧 마감: 이미 지난 것은 빼고 가까운 순서로
    var soon: [SharedStore.Soon] {
        (entry.today?.soon ?? []).filter { dueLabel($0.due) != "지남" && dueLabel($0.due) != "" }
    }
    var body: some View {
        switch family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "square.and.pencil").font(.system(size: 20, weight: .semibold))
            }.widgetURL(writeURL)
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                if items.isEmpty, let s = soon.first {
                    // 오늘 칸이 비어 있으면 가장 가까운 마감을 대신 보여 준다
                    Text("다음 마감 \(dueLabel(s.due))").font(.system(size: 12, weight: .bold))
                    Text(s.title).font(.system(size: 12)).lineLimit(2)
                } else {
                    Text("오늘 \(items.filter { $0.done }.count)/\(items.count)").font(.system(size: 12, weight: .bold))
                    ForEach(items.prefix(soon.isEmpty ? 2 : 1), id: \.id) { i in Text((i.done ? "✓ " : "□ ") + i.title).font(.system(size: 12)).lineLimit(1) }
                    if let s = soon.first { Text("\(dueLabel(s.due)) \(s.title)").font(.system(size: 12)).lineLimit(1) }
                }
            }
        default:
            let small = family == .systemSmall
            let ns = soon.isEmpty ? 0 : (small ? 1 : 2)   // 곧 마감 줄 수
            let n = (small ? 4 : 5) - (ns == 0 ? 0 : ns)
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("오늘").font(.system(size: 12, weight: .heavy)).foregroundColor(navy)
                    Text("\(items.filter { $0.done }.count)/\(items.count)").font(.system(size: 11, weight: .semibold).monospacedDigit()).foregroundColor(navy.opacity(0.5))
                    Spacer()
                    // 작은 위젯은 빈 곳 어디를 눌러도 적기로 열린다(작은 위젯에는 따로 누르는 링크를 둘 수 없다)
                    if small { WriteLabel() } else { Link(destination: writeURL) { WriteLabel() } }
                }.padding(.bottom, 6)
                if items.isEmpty {
                    Text(entry.today?.first.flatMap { $0.isEmpty ? nil : $0 } ?? (soon.isEmpty ? "앱에서 오늘 할 것 적기" : "오늘 할 것은 아직 비어 있어요")).font(.system(size: 13)).foregroundColor(navy.opacity(0.5)).padding(.bottom, 4)
                } else {
                    ForEach(items.prefix(n), id: \.id) { i in
                        Row(item: i).padding(.vertical, 4)
                        Rectangle().fill(rule).frame(height: 0.5)
                    }
                }
                if ns > 0 {
                    ForEach(soon.prefix(ns), id: \.id) { s in SoonRow(s: s, canPick: !small).padding(.top, 5) }
                }
                Spacer(minLength: 0)
            }.widgetURL(small ? writeURL : nil)
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
        .description("오늘 할 것과 체크칸, 곧 마감, 떠오른 것 바로 적기")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular])
    }
}
