// 앱·위젯·공유·시리가 함께 쓰는 작은 저장소(App Group)
import Foundation

enum SharedStore {
    static let group = "group.com.hvsodream.dualplanner"
    static var defaults: UserDefaults { UserDefaults(suiteName: group) ?? .standard }

    // 위젯이 보여 줄 오늘 목록
    struct Item: Codable { var id: String; var title: String; var done: Bool }
    struct Today: Codable { var date: String; var items: [Item]; var first: String? }

    static func saveToday(_ t: Today) {
        if let d = try? JSONEncoder().encode(t) { defaults.set(d, forKey: "today") }
    }
    static func loadToday() -> Today? {
        guard let d = defaults.data(forKey: "today") else { return nil }
        return try? JSONDecoder().decode(Today.self, from: d)
    }

    // 위젯에서 누른 체크(앱이 열릴 때 반영)
    static func pushCheck(_ id: String) {
        var a = defaults.stringArray(forKey: "pendingChecks") ?? []
        a.append(id); defaults.set(a, forKey: "pendingChecks")
    }

    // 공유 시트·시리로 들어온 한 줄(앱이 열릴 때 오늘 포스트잇으로)
    struct Shared: Codable { var text: String; var at: String; var src: String }
    static func pushShared(_ text: String, src: String) {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines); guard !t.isEmpty else { return }
        var a = loadShared(); let f = DateFormatter(); f.dateFormat = "HH:mm"; f.timeZone = .current
        a.append(Shared(text: String(t.prefix(300)), at: f.string(from: Date()), src: src))
        if let d = try? JSONEncoder().encode(a) { defaults.set(d, forKey: "shared") }
    }
    static func loadShared() -> [Shared] {
        guard let d = defaults.data(forKey: "shared") else { return [] }
        return (try? JSONDecoder().decode([Shared].self, from: d)) ?? []
    }
    static func takePending() -> (checks: [String], shared: [Shared]) {
        let c = defaults.stringArray(forKey: "pendingChecks") ?? [], s = loadShared()
        defaults.removeObject(forKey: "pendingChecks"); defaults.removeObject(forKey: "shared")
        return (c, s)
    }
}
