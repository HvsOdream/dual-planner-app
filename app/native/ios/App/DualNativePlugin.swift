// 웹(index.html)에서 부르는 아이폰 기능: 캘린더 읽기, 위젯 갱신, 위젯·공유·시리에서 들어온 것 받기
import Foundation
import Capacitor
import EventKit
import WidgetKit
import AuthenticationServices
import CryptoKit
import Security
import UIKit
import StoreKit

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
        CAPPluginMethod(name: "googleSignIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "calendarAdd", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openUrl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "iapList", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "iapBuy", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "iapRestore", returnType: CAPPluginReturnPromise),
    ]
    private var iapWatch: Task<Void, Never>?
    private let store = EKEventStore()
    private var appleDelegate: AppleSignInDelegate?
    private var webAuth: ASWebAuthenticationSession?
    private var webAuthAnchor: WebAuthAnchor?

    private static func b64url(_ d: Data) -> String {
        return d.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }

    // 기기 Google 로그인: 시스템 로그인 창(ASWebAuthenticationSession) + PKCE. id_token(JWT)을 돌려주면 서버가 검증한다(aud = iOS 클라이언트 ID)
    // { clientId: "….apps.googleusercontent.com" }
    @objc func googleSignIn(_ call: CAPPluginCall) {
        let suffix = ".apps.googleusercontent.com"
        guard let clientId = call.getString("clientId"), clientId.hasSuffix(suffix) else { call.reject("no client id"); return }
        let scheme = "com.googleusercontent.apps." + String(clientId.dropLast(suffix.count))
        let redirect = scheme + ":/oauth2redirect"
        var raw = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, raw.count, &raw) == errSecSuccess else { call.reject("random"); return }
        let verifier = DualNativePlugin.b64url(Data(raw))
        let challenge = DualNativePlugin.b64url(Data(SHA256.hash(data: Data(verifier.utf8))))
        var c = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        c.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: redirect),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: "openid email profile"),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "prompt", value: "select_account"),
        ]
        guard let url = c.url else { call.reject("bad url"); return }
        DispatchQueue.main.async {
            let anchor = WebAuthAnchor(window: self.bridge?.webView?.window)
            let s = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { [weak self] cb, err in
                self?.webAuth = nil; self?.webAuthAnchor = nil
                if let err = err {
                    let canceled = (err as? ASWebAuthenticationSessionError)?.code == .canceledLogin
                    call.reject(canceled ? "canceled" : err.localizedDescription); return
                }
                guard let cb = cb, let code = URLComponents(url: cb, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "code" })?.value else { call.reject("no code"); return }
                var body = URLComponents()
                body.queryItems = [
                    URLQueryItem(name: "client_id", value: clientId),
                    URLQueryItem(name: "code", value: code),
                    URLQueryItem(name: "code_verifier", value: verifier),
                    URLQueryItem(name: "grant_type", value: "authorization_code"),
                    URLQueryItem(name: "redirect_uri", value: redirect),
                ]
                var req = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
                req.httpMethod = "POST"
                req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
                req.httpBody = (body.percentEncodedQuery ?? "").replacingOccurrences(of: "+", with: "%2B").data(using: .utf8)
                URLSession.shared.dataTask(with: req) { data, _, e in
                    if let e = e { call.reject(e.localizedDescription); return }
                    guard let data = data, let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { call.reject("bad token response"); return }
                    guard let token = j["id_token"] as? String else { call.reject((j["error_description"] as? String) ?? (j["error"] as? String) ?? "no id token"); return }
                    call.resolve(["idToken": token])
                }.resume()
            }
            s.presentationContextProvider = anchor
            self.webAuth = s; self.webAuthAnchor = anchor
            if !s.start() { self.webAuth = nil; self.webAuthAnchor = nil; call.reject("could not start") }
        }
    }

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
        let soon = (call.getArray("soon", JSObject.self) ?? []).compactMap { o -> SharedStore.Soon? in
            guard let id = o["id"] as? String, let t = o["title"] as? String, let d = o["due"] as? String else { return nil }
            return SharedStore.Soon(id: id, title: t, due: d)
        }
        SharedStore.saveToday(SharedStore.Today(date: call.getString("date") ?? "", items: items, first: call.getString("first"), soon: soon))
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    // { url } → 다른 앱 열기(내 에이전트와 논의하기: claude://…). 못 열면 ok=false
    @objc func openUrl(_ call: CAPPluginCall) {
        guard let u = URL(string: call.getString("url") ?? "") else { call.resolve(["ok": false]); return }
        DispatchQueue.main.async { UIApplication.shared.open(u, options: [:]) { ok in call.resolve(["ok": ok]) } }
    }

    // ── 속지 구매(StoreKit 2). 상품은 자동 갱신 없는 1년 속지 하나. 애플 서명이 확인된 거래만 돌려준다 ──
    // 앱이 떠 있는 동안 밖에서 끝난 거래(가족 승인, 환불 등)를 받아 웹에 알린다
    override public func load() {
        iapWatch = Task { [weak self] in
            for await r in Transaction.updates {
                if case .verified(let t) = r { await t.finish() }
                self?.notifyListeners("iapUpdate", data: [:])
            }
        }
    }
    deinit { iapWatch?.cancel() }

    // 이 Apple 계정이 산 속지 전부: [{ id, d: "YYYY-MM-DD"(산 날), rv: 환불됨 }]
    private func iapTx(_ pid: String) async -> [[String: Any]] {
        let df = DateFormatter(); df.dateFormat = "yyyy-MM-dd"; df.timeZone = .current
        var out: [[String: Any]] = []
        for await r in Transaction.all {
            guard case .verified(let t) = r, t.productID == pid else { continue }
            out.append(["id": String(t.id), "d": df.string(from: t.purchaseDate), "rv": t.revocationDate != nil])
        }
        return out
    }
    private func iapProduct(_ pid: String) async -> Product? {
        return (try? await Product.products(for: [pid]))?.first
    }

    // { id } → { tx, price } 값은 그 나라 상점의 표시 값
    @objc func iapList(_ call: CAPPluginCall) {
        guard let pid = call.getString("id"), !pid.isEmpty else { call.reject("no id"); return }
        Task {
            let p = await self.iapProduct(pid)
            call.resolve(["tx": await self.iapTx(pid), "price": p?.displayPrice ?? ""])
        }
    }

    // { id } → { status: ok | canceled | pending | none | error, tx }
    @objc func iapBuy(_ call: CAPPluginCall) {
        guard let pid = call.getString("id"), !pid.isEmpty else { call.reject("no id"); return }
        Task {
            guard let p = await self.iapProduct(pid) else { call.resolve(["status": "none", "tx": []]); return }
            do {
                let res = try await p.purchase()
                switch res {
                case .success(let v):
                    if case .verified(let t) = v { await t.finish(); call.resolve(["status": "ok", "tx": await self.iapTx(pid)]) }
                    else { call.resolve(["status": "error", "tx": []]) }
                case .userCancelled: call.resolve(["status": "canceled", "tx": []])
                case .pending: call.resolve(["status": "pending", "tx": []])
                @unknown default: call.resolve(["status": "error", "tx": []])
                }
            } catch { call.resolve(["status": "error", "tx": [], "message": error.localizedDescription]) }
        }
    }

    // { id } → App Store와 다시 맞춘 뒤 { tx }. 맞추기를 닫아도 기기에 있는 거래는 돌려준다
    @objc func iapRestore(_ call: CAPPluginCall) {
        guard let pid = call.getString("id"), !pid.isEmpty else { call.reject("no id"); return }
        Task {
            try? await AppStore.sync()
            call.resolve(["tx": await self.iapTx(pid)])
        }
    }

    // 위젯 체크, 공유 시트·시리로 들어온 것을 꺼내 준다(꺼내면 비운다)
    @objc func takePending(_ call: CAPPluginCall) {
        let p = SharedStore.takePending()
        call.resolve(["checks": p.checks, "picks": p.picks, "shared": p.shared.map { ["text": $0.text, "at": $0.at, "src": $0.src] }])
    }
}

final class WebAuthAnchor: NSObject, ASWebAuthenticationPresentationContextProviding {
    let window: UIWindow?
    init(window: UIWindow?) { self.window = window }
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        if let w = window { return w }
        return UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
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
