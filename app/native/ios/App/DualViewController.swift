// 기본 Capacitor 화면. 앱 전용 플러그인(DualNative)은 capacitor.config.json의 packageClassList로 올라가고,
// 혹시 빠졌을 때만 여기서 한 번 더 붙인다
import UIKit
import Capacitor

class DualViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        if bridge?.plugin(withName: "DualNative") == nil {
            bridge?.registerPluginInstance(DualNativePlugin())
        }
    }
}
