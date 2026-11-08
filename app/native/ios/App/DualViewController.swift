// 기본 Capacitor 화면에 앱 전용 플러그인(DualNative)을 붙인다
import UIKit
import Capacitor

class DualViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(DualNativePlugin())
    }
}
