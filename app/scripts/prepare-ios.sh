#!/usr/bin/env bash
# DUAL Planner iOS 프로젝트 준비 (macOS 러너). www/ 가 채워진 뒤 호출한다.
set -euo pipefail
cd "$(dirname "$0")/.."
test -f www/index.html

# Capacitor 8.5+ 템플릿(UIScene) — iOS 27 SDK 빌드·아이폰 듀오 전체 화면 조건
if [ ! -d ios ]; then npx cap add ios --packagemanager CocoaPods; fi
npx cap sync ios

# 최소 iOS 17.0(위젯 체크·앱 인텐트)
sed -i '' -E 's/IPHONEOS_DEPLOYMENT_TARGET = [0-9.]+;/IPHONEOS_DEPLOYMENT_TARGET = 17.0;/g' ios/App/App.xcodeproj/project.pbxproj
sed -i '' -E "s/^platform :ios, '[0-9.]+'/platform :ios, '17.0'/" ios/App/Podfile
(cd ios/App && pod install)

# 앱 전용 Swift 파일 + 위젯·공유 확장 타깃
ruby scripts/add-native.rb
# 시작 화면을 DualViewController 로(앱 전용 플러그인 등록)
sed -i '' -E 's/customClass="CAPBridgeViewController" customModule="Capacitor"/customClass="DualViewController" customModule="App" customModuleProvider="target"/' ios/App/App/Base.lproj/Main.storyboard
grep -q 'DualViewController' ios/App/App/Base.lproj/Main.storyboard || { echo 'Main.storyboard 교체 실패'; exit 1; }
# 앱 전용 플러그인을 Capacitor 기본 플러그인 목록에도 올린다(웹에 기능 목록이 실리도록)
python3 - <<'PY'
import json
p = 'ios/App/App/capacitor.config.json'
c = json.load(open(p))
l = c.get('packageClassList') or []
if 'DualNativePlugin' not in l: l.append('DualNativePlugin')
c['packageClassList'] = l
json.dump(c, open(p, 'w'), indent=2)
print('[prepare-ios] packageClassList:', l)
PY
grep -q DualNativePlugin ios/App/App/capacitor.config.json || { echo 'packageClassList 등록 실패'; exit 1; }

PLIST=ios/App/App/Info.plist
PB="/usr/libexec/PlistBuddy -c"
set_plist() { $PB "Delete :$1" "$PLIST" 2>/dev/null || true; $PB "Add :$1 $2 $3" "$PLIST"; }
set_plist CFBundleDisplayName string "DUAL"
set_plist ITSAppUsesNonExemptEncryption bool false
set_plist UIRequiresFullScreen bool false
set_plist UIStatusBarStyle string UIStatusBarStyleDarkContent
set_plist UIViewControllerBasedStatusBarAppearance bool true
set_plist NSCalendarsFullAccessUsageDescription string "오늘 일정을 플래너 맨 위 일정 칸에 보여 줘요"
set_plist NSCalendarsUsageDescription string "오늘 일정을 플래너 맨 위 일정 칸에 보여 줘요"
set_plist NSCameraUsageDescription string "오늘 사진 한 장을 찍어 그날 기록에 붙여요"
set_plist NSPhotoLibraryUsageDescription string "앨범에서 고른 사진을 그날 기록에 붙여요"

# 앱 아이콘: 레포의 1024 아이콘(테라코타 천 + 접힌 D)
ICON_DIR=ios/App/App/Assets.xcassets/AppIcon.appiconset
for f in "$ICON_DIR"/*.png; do sips -s format png -z 1024 1024 www/icons/icon-1024.png --out "$f" >/dev/null; done
# 알파 채널 없애기(App Store 아이콘 규칙)
for f in "$ICON_DIR"/*.png; do sips -s format jpeg "$f" --out /tmp/i.jpg >/dev/null && sips -s format png /tmp/i.jpg --out "$f" >/dev/null; done

# 실행 화면: 테라코타 단색(곧바로 앱 표지가 이어진다)
SPLASH_DIR=ios/App/App/Assets.xcassets/Splash.imageset
if [ -d "$SPLASH_DIR" ]; then
  python3 - "$SPLASH_DIR" <<'PY'
import sys, os, struct, zlib
d = sys.argv[1]
def png(path, w, h, rgb):
    raw = b''.join(b'\x00' + bytes(rgb) * w for _ in range(h))
    def chunk(t, data): c = struct.pack('>I', len(data)) + t + data; return c + struct.pack('>I', zlib.crc32(t + data) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
for f in os.listdir(d):
    if f.endswith('.png'): png(os.path.join(d, f), 2732, 2732, (0xA9, 0x50, 0x3A))
PY
fi
plutil -lint "$PLIST"
grep -q "UIApplicationSceneManifest" "$PLIST" || { echo "Info.plist에 UIApplicationSceneManifest 없음"; exit 1; }
echo "[prepare-ios] done"
