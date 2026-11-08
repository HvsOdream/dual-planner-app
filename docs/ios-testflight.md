# DUAL Planner iOS 앱 (TestFlight)

서일 오피스(hwp-pad)와 같은 틀이다. 맥 없이 GitHub Actions macOS 러너가 빌드·서명·업로드한다.
인증서 레포(`HvsOdream/ios-certs`)·`MATCH_PASSWORD`·App Store Connect API 키는 서일 오피스와 공유한다.

## 구성
- `app/` Capacitor 껍데기. 웹은 레포 루트(index.html·brand·icons·legal·manifest)를 `www/`로 복사해 쓴다.
- `app/native/native.js` 앱 안에서만: 상태 표시줄, 앱이 앞으로 오면 서버에서 다시 받기.
- `app/scripts/prepare-ios.sh` `cap add ios` 뒤 Info.plist, 앱 아이콘(icons/icon-1024.png), 네이비 실행 화면.
- `app/fastlane/Fastfile` match → build → TestFlight.
- `.github/workflows/ios-testflight.yml` 수동 실행.

App ID `com.hvsodream.dualplanner` (Sign in with Apple·인앱결제 켜짐) · 웹 로그인 Services ID `com.hvsodream.dualplanner.web`.

## 1회 준비
1. App Store Connect에 앱 레코드: 이름·번들 ID `com.hvsodream.dualplanner`·SKU `dual-planner`.
2. 이 레포 Secrets 6개(서일 오피스와 같은 값): `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64`, `APPLE_TEAM_ID`, `MATCH_PASSWORD`, `MATCH_GIT_BASIC_AUTHORIZATION`
   → https://github.com/HvsOdream/dual-planner-app/settings/secrets/actions
   값은 Dropbox `00_Data/Cowork/secrets/apple/` 에 있다.

## 빌드
Actions → iOS TestFlight → Run workflow. 첫 빌드 15~25분 → App Store Connect TestFlight 탭에서 처리 10~30분 → 내부 테스터(본인)에게 바로 배포.

## 다음 빌드에서 넣을 것
- 앱 안 로그인: 애플은 기기 로그인 창(aud = 번들 ID라 서버가 두 aud를 받게), 구글은 iOS용 클라이언트 ID + 기기 로그인
- 아침·저녁·일요일 알림(로컬 알림)
- 속지 인앱결제
