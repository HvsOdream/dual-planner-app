// 공유 시트 「DUAL」: 글·링크를 받아 두고, 다음에 앱을 열면 오늘 포스트잇으로 붙는다
import UIKit
import UniformTypeIdentifiers

class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0xFC/255, green: 0xFB/255, blue: 0xF7/255, alpha: 0.98)
        let label = UILabel(); label.text = "DUAL에 붙이는 중"; label.font = .systemFont(ofSize: 17, weight: .semibold)
        label.textColor = UIColor(red: 0x1E/255, green: 0x2F/255, blue: 0x4F/255, alpha: 1)
        label.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(label)
        NSLayoutConstraint.activate([label.centerXAnchor.constraint(equalTo: view.centerXAnchor), label.centerYAnchor.constraint(equalTo: view.centerYAnchor)])
        Task { await collect(); label.text = "붙여 뒀어요 ✓"; try? await Task.sleep(nanoseconds: 600_000_000); done() }
    }

    private func collect() async {
        var parts: [String] = []
        for item in (extensionContext?.inputItems as? [NSExtensionItem]) ?? [] {
            if let t = item.attributedContentText?.string, !t.isEmpty { parts.append(t) }
            for p in item.attachments ?? [] {
                if p.hasItemConformingToTypeIdentifier(UTType.url.identifier), let u = try? await p.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL { parts.append(u.absoluteString) }
                else if p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier), let s = try? await p.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String { parts.append(s) }
            }
        }
        var seen = Set<String>(); let text = parts.filter { seen.insert($0).inserted }.joined(separator: " ")
        SharedStore.pushShared(text, src: "share")
    }

    private func done() { extensionContext?.completeRequest(returningItems: nil) }
}
