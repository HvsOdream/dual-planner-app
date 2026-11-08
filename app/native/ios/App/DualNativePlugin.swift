// 웹(index.html)에서 부르는 아이폰 기능: 캘린더 읽기, 위젯 갱신, 위젯·공유·시리에서 들어온 것 받기
import Foundation
import Capacitor
import EventKit
import WidgetKit

@objc(DualNativePlugin)
public class DualNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DualNativePlugin"
    public let jsName = "DualNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "calendarAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "calendarEvents", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "widgetSave", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takePending", returnType: CAPPluginReturnPromise),
    ]
    private let store = EKEventStore()

    private func status() -> String {
        switch EKEventStore.authorizationStatus(for: .event) {
        case .fullAccess, .authorized: return "granted"
        case .denied, .restricted: return "denied"
        case .writeOnly: return "denied"
        case .notDetermined: return "prompt"
        @unknown default: return "prompt"
        }
    }

    // { ask: true } 이면 처음 한 번 권한을 묻는다
    @objc func calendarAccess(_ call: CAPPluginCall) {
        let ask = call.getBool("ask") ?? false
        if status() != "prompt" || !ask { call.resolve(["status": status()]); return }
        store.requestFullAccessToEvents { [weak self] _, _ in
            call.resolve(["status": self?.status() ?? "denied"])
        }
    }

    // { from: "YYYY-MM-DD", to: "YYYY-MM-DD" } → 서버 /cal 과 같은 모양
    @objc func calendarEvents(_ call: CAPPluginCall) {
        guard status() == "granted" else { call.resolve(["events": [], "status": status()]); return }
        let df = DateFormatter(); df.dateFormat = "yyyy-MM-dd"; df.timeZone = .current
        guard let from = df.date(from: call.getString("from") ?? ""), let to = df.date(from: call.getString("to") ?? "") else {
            call.reject("bad range"); return
        }
        let pred = store.predicateForEvents(withStart: from, end: to, calendars: nil)
        let hm = DateFormatter(); hm.dateFormat = "HH:mm"; hm.timeZone = .current
        var out: [[String: Any]] = []
        let cal = Calendar.current
        for e in store.events(matching: pred).sorted(by: { ($0.startDate ?? .distantPast) < ($1.startDate ?? .distantPast) }) {
            if e.status == .canceled { continue }
            guard let st: Date = e.startDate else { continue }
            let en: Date = e.endDate ?? st
            let title = (e.title ?? "").isEmpty ? "(제목 없음)" : e.title!
            if e.isAllDay {
                var d = cal.startOfDay(for: st)
                let end = en
                while d < end && d < to {
                    if d >= from { out.append(["date": df.string(from: d), "start": "", "end": "", "title": title, "allDay": true]) }
                    d = cal.date(byAdding: .day, value: 1, to: d)!
                }
            } else {
                out.append(["date": df.string(from: st), "start": hm.string(from: st), "end": hm.string(from: en), "title": title, "allDay": false])
            }
            if out.count >= 400 { break }
        }
        call.resolve(["events": out, "status": "granted"])
    }

    // { date, items: [{id, title, done}], first } → 위젯
    @objc func widgetSave(_ call: CAPPluginCall) {
        let raw = call.getArray("items", JSObject.self) ?? []
        let items = raw.compactMap { o -> SharedStore.Item? in
            guard let id = o["id"] as? String, let t = o["title"] as? String else { return nil }
            return SharedStore.Item(id: id, title: t, done: (o["done"] as? Bool) ?? false)
        }
        SharedStore.saveToday(SharedStore.Today(date: call.getString("date") ?? "", items: items, first: call.getString("first")))
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    // 위젯 체크, 공유 시트·시리로 들어온 것을 꺼내 준다(꺼내면 비운다)
    @objc func takePending(_ call: CAPPluginCall) {
        let p = SharedStore.takePending()
        call.resolve(["checks": p.checks, "shared": p.shared.map { ["text": $0.text, "at": $0.at, "src": $0.src] }])
    }
}
