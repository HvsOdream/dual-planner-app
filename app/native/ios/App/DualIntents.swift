// 시리·단축어: "DUAL에 적어" → 다음에 앱을 열면 오늘 포스트잇으로 붙는다
import AppIntents

struct AddToDualIntent: AppIntent {
    static var title: LocalizedStringResource = "DUAL에 적기"
    static var description = IntentDescription("한 줄을 DUAL 플래너 오늘 쪽에 붙여 둡니다.")
    @Parameter(title: "내용", requestValueDialog: "뭐라고 적을까요?") var text: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        SharedStore.pushShared(text, src: "siri")
        return .result(dialog: "적어 뒀어요")
    }
}

struct DualShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: AddToDualIntent(),
                    phrases: ["\(.applicationName)에 적어", "\(.applicationName)에 할 일 추가", "\(.applicationName)에 메모"],
                    shortTitle: "DUAL에 적기", systemImageName: "checkmark.square")
    }
}
