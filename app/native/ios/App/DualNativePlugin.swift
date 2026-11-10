// 웹(index.html)에서 부르는 아이폰 기능: 캘린더 읽기, 위젯 갱신, 위젯·공유·시리에서 들어온 것 받기
import Foundation
import Capacitor
import EventKit
import WidgetKit
import AuthenticationServices
import UIKit

@objc(DualNativePlugin)
public class DualNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DualNativePlugin"
    public let jsName = "DualNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "calendarAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "calendarEvents", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "widgetSave", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takePending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "appleSignIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "calendarAdd", returnType: CAPPluginReturnPromise),
    ]
    private let store = EKEventStore()
    private var appleDelegate: AppleSignInDelegate?

    // 기기 Apple 로그인: identity token(JWT)을 돌려주면 서버가 검증한다(aud = 앱 번들 ID)
    @objc func appleSignIn(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let req = ASAuthorizationAppleIDProvider().createRequest()
            req.requestedScopes = [.fullName, .email]
            let d = AppleSignInDelegate(call: call, window: self.bridge?.webView?.window) { [weak self] in self?.appleDelegate = nil }
            self.appleDelegate = d
            let c = ASAuthorizationController(authorizationRequests: [req])
            c.delegate = d
            c.presentationContextProvider = d
            c.performRequests()
        }
    }

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

    // { date: "YYYY-MM-DD", start: "HH:mm", minutes, title } → 기본 캘린더에 일정 하나
    @objc func calendarAdd(_ call: CAPPluginCall) {
        guard status() == "granted" else { call.resolve(["ok": false, "status": status()]); return }
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH:mm"; f.timeZone = .current
        guard let st = f.date(from: (call.getString("date") ?? "") + " " + (call.getString("start") ?? "")),
              let cal = store.defaultCalendarForNewEvents else { call.reject("bad time"); return }
        let e = EKEvent(eventStore: store)
        e.title = call.getString("title") ?? ""
        e.startDate = st
        e.endDate = st.addingTimeInterval(Double(call.getInt("minutes") ?? 60) * 60)
        e.calendar = cal
        if let a = call.getInt("alarm") { e.addAlarm(EKAlarm(relativeOffset: -Double(a) * 60)) }
        do { try store.save(e, span: .thisEvent); call.resolve(["ok": true, "id": e.eventIdentifier ?? ""]) }
        catch { call.reject(error.localizedDescription) }
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

final class AppleSignInDelegate: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    let call: CAPPluginCall
    let window: UIWindow?
    let done: () -> Void
    init(call: CAPPluginCall, window: UIWindow?, done: @escaping () -> Void) { self.call = call; self.window = window; self.done = done }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        if let w = window { return w }
        return UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
    }
    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let cred = authorization.credential as? ASAuthorizationAppleIDCredential,
              let data = cred.identityToken, let token = String(data: data, encoding: .utf8) else {
            call.reject("no token"); done(); return
        }
        let name = [cred.fullName?.familyName, cred.fullName?.givenName].compactMap { $0 }.joined()
        call.resolve(["idToken": token, "name": name, "email": cred.email ?? ""])
        done()
    }
    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let canceled = (error as? ASAuthorizationError)?.code == .canceled
        call.reject(canceled ? "canceled" : error.localizedDescription)
        done()
    }
}
