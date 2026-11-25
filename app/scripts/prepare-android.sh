#!/usr/bin/env bash
# DUAL Planner 안드로이드 프로젝트 준비 (리눅스 러너). www/ 가 채워진 뒤 호출한다.
# iOS와 같은 방식: android/ 폴더는 저장소에 두지 않고 여기서 만든다.
set -euo pipefail
cd "$(dirname "$0")/.."
test -f www/index.html

if [ ! -d android ]; then npx cap add android; fi
npx cap sync android

# 앱 전용 플러그인(DualNative)과 그것을 올리는 MainActivity
PKG=android/app/src/main/java/com/hvsodream/dualplanner
mkdir -p "$PKG"
cp native/android/MainActivity.java native/android/DualNativePlugin.java "$PKG"/

python3 - <<'PY'
import re
p = 'android/app/src/main/AndroidManifest.xml'; s = open(p, encoding='utf-8').read()
# 권한: 캘린더 읽기·쓰기, 알림
for perm in ['android.permission.READ_CALENDAR', 'android.permission.WRITE_CALENDAR', 'android.permission.POST_NOTIFICATIONS']:
    if perm not in s: s = s.replace('</manifest>', '    <uses-permission android:name="%s" />\n</manifest>' % perm)
# 「적기」로 여는 주소(dualplanner://write)
if 'android:scheme="dualplanner"' not in s:
    f = ('            <intent-filter>\n                <action android:name="android.intent.action.VIEW" />\n'
         '                <category android:name="android.intent.category.DEFAULT" />\n                <category android:name="android.intent.category.BROWSABLE" />\n'
         '                <data android:scheme="dualplanner" />\n            </intent-filter>\n        </activity>')
    assert '</activity>' in s; s = s.replace('        </activity>', f, 1) if '        </activity>' in s else s.replace('</activity>', f, 1)
open(p, 'w', encoding='utf-8').write(s)
# 앱 이름
p = 'android/app/src/main/res/values/strings.xml'; s = open(p, encoding='utf-8').read()
s = re.sub(r'(<string name="(?:app_name|title_activity_main)">)[^<]*', r'\1DUAL', s)
open(p, 'w', encoding='utf-8').write(s)
print('[prepare-android] manifest·strings 고침')
PY
grep -q 'READ_CALENDAR' android/app/src/main/AndroidManifest.xml
grep -q 'android:scheme="dualplanner"' android/app/src/main/AndroidManifest.xml

# 앱 아이콘: 레포의 1024 아이콘(테라코타 천 + 접힌 D). 적응형 아이콘은 가운데만 보이므로 78%로 줄여 얹는다
python3 - <<'PY'
import glob, os, re
from PIL import Image
src = Image.open('www/icons/icon-1024.png').convert('RGBA'); BG = (0xA9, 0x50, 0x3A, 255)
res = 'android/app/src/main/res'
for name, legacy, fg in [('mdpi', 48, 108), ('hdpi', 72, 162), ('xhdpi', 96, 216), ('xxhdpi', 144, 324), ('xxxhdpi', 192, 432)]:
    d = '%s/mipmap-%s' % (res, name); os.makedirs(d, exist_ok=True)
    im = src.resize((legacy, legacy), Image.LANCZOS)
    im.save(d + '/ic_launcher.png'); im.save(d + '/ic_launcher_round.png')
    c = Image.new('RGBA', (fg, fg), BG); k = round(fg * .78); c.paste(src.resize((k, k), Image.LANCZOS), ((fg - k) // 2, (fg - k) // 2))
    c.save(d + '/ic_launcher_foreground.png')
# 적응형 아이콘 바탕색
hit = False
for p in glob.glob(res + '/values/*.xml'):
    s = open(p, encoding='utf-8').read()
    if 'ic_launcher_background' in s:
        s2 = re.sub(r'(<color name="ic_launcher_background">)[^<]*', r'\1#A9503A', s)
        if s2 != s: open(p, 'w', encoding='utf-8').write(s2); hit = True
print('[prepare-android] 아이콘 넣음 · 바탕색', '고침' if hit else '그대로(색 항목 없음)')
PY
echo "[prepare-android] done"
