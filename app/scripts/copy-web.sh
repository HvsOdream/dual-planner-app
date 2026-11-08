#!/usr/bin/env bash
# 레포 루트의 웹 파일을 app/www 로 복사하고 앱 전용 스크립트(native.js)를 붙인다
set -euo pipefail
cd "$(dirname "$0")/../.."
rm -rf app/www && mkdir -p app/www
cp index.html manifest.webmanifest app/www/
cp -R brand icons legal app/www/
cp app/native/native.js app/www/native.js
node -e "const fs=require('fs');const p='app/www/index.html';let h=fs.readFileSync(p,'utf8');if(!h.includes('native.js'))h=h.replace(/<\/head>/i,'<script src=\"native.js\" defer></script>\n</head>');fs.writeFileSync(p,h)"
grep -q "native.js" app/www/index.html
du -sh app/www
