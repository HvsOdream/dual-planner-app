// 번역 열쇠 점검.  node tools/i18n.js [--check] [--todo]
//   index.html에서 T('…')·N('…')·data-t 글자를 주워 열쇠 목록을 만들고, lang/*.js 사전마다 빠진 열쇠와 남는 열쇠를 알려 준다.
//   --check  남는 열쇠(원문에서 사라진 것)나 사전 문법 오류가 있으면 종료 코드 1 (빠진 열쇠는 번역이 끝나기 전까지 오류가 아니다)
//   --todo   아직 T()에 안 들어간 한국어 문구를 함수별로 세어 docs/i18n-todo.md 에 적는다
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..'), src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/^\s*\/\/.*$/gm, ''); // 주석 줄의 예시는 줍지 않는다
const keys = new Set(), un = s => s.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n');
// T('문구'[, 값[, '자리']]) · N('문구'). 둘째 칸은 괄호 깊이를 세며 건너뛴다(값에 함수 호출이 들어 있어도 되게)
for (const m of src.matchAll(/\b([TN])\(\s*(['"`])((?:\\.|(?!\2).)*)\2/g)) {
  if (m[2] === '`' && /\$\{/.test(m[3])) { console.log('⚠ T() 안에 ${}가 있습니다. {이름}으로 바꿔 주세요: ' + m[3].slice(0, 50)); continue; }
  let i = m.index + m[0].length, depth = 0, commas = 0, ctx = ''; const open = '([{', close = ')]}';
  for (; i < src.length; i++) { const ch = src[i];
    if (ch === "'" || ch === '"' || ch === '`') { const j = i; i++; while (i < src.length && src[i] !== ch) { if (src[i] === '\\') i++; i++; } if (depth === 0 && commas === 2) ctx = src.slice(j + 1, i); continue; }
    if (open.includes(ch)) depth++; else if (close.includes(ch)) { if (depth === 0) break; depth--; } else if (ch === ',' && depth === 0) commas++; }
  keys.add(un(m[3]) + (ctx && /^[\w-]+$/.test(ctx) ? '@' + ctx : '')); }
// <… data-t>글자</…> · data-t="열쇠" · aria-label="…" data-t-aria
for (const m of src.matchAll(/<[^>]*\sdata-t(?:="([^"]*)")?[^>]*>([^<]*)</g)) keys.add((m[1] || m[2]).trim());
for (const m of src.matchAll(/aria-label="([^"]*)"[^>]*\sdata-t-aria/g)) keys.add(m[1]);
keys.delete('');
let bad = 0; console.log(`열쇠 ${keys.size}개`);
for (const f of fs.readdirSync(path.join(ROOT, 'lang')).filter(f => f.endsWith('.js')).sort()) {
  const box = { window: {} };
  try { vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'lang', f), 'utf8'), box); } catch (e) { console.log(`✗ ${f}: 문법 오류 — ${e.message}`); bad++; continue; }
  const d = box.window.DP_DICT || {}, miss = [...keys].filter(k => !(k in d)), stale = Object.keys(d).filter(k => !keys.has(k));
  const hole = Object.keys(d).filter(k => { const want = (k.split('@')[0].match(/\{\w+\}/g) || []).sort().join(), vals = [].concat(d[k]); return vals.some(v => (String(v).match(/\{\w+\}/g) || []).sort().join() !== want); });
  console.log(`${f}: 번역 ${Object.keys(d).length} · 빠짐 ${miss.length} · 남음 ${stale.length} · {값} 안 맞음 ${hole.length}`);
  miss.slice(0, 40).forEach(k => console.log('   + ' + JSON.stringify(k)));
  stale.forEach(k => console.log('   − ' + JSON.stringify(k))); hole.forEach(k => console.log('   ! ' + JSON.stringify(k)));
  bad += stale.length + hole.length; }
if (process.argv.includes('--todo')) {
  // 본문 스크립트에서 주석과 이미 옮긴 문구를 걷어내고, 남은 한국어 조각을 가장 가까운 앞쪽 function 이름으로 묶는다(어림)
  const js = src.slice(src.lastIndexOf('<script>')), cnt = {}, ex = {}; let fn = '(맨 위)', total = 0;
  for (let line of js.split('\n')) {
    const f = /^(?:async\s+)?function\s+(\w+)/.exec(line); if (f) fn = f[1];
    line = line.replace(/\/\/.*$/, '').replace(/\b[TN]\(\s*(['"`])(?:\\.|(?!\1).)*\1/g, '').replace(/\/(?:\\.|[^\/\n])+\/[gimsu]*/g, m => /[가-힣]/.test(m) && /[\\|\[\]()?*+]/.test(m) ? '' : m);
    const ks = line.match(/[가-힣][가-힣 0-9A-Za-z·,.!?~()\[\]:%+-]*[가-힣.!?]|[가-힣]/g) || [];
    if (ks.length) { cnt[fn] = (cnt[fn] || 0) + ks.length; total += ks.length; (ex[fn] = ex[fn] || []).push(...ks.slice(0, 2)); } }
  const html = src.slice(src.indexOf('<body'), src.lastIndexOf('<script>')).replace(/<[^>]*\sdata-t[^>]*>[^<]*/g, ''), hk = (html.match(/>[^<]*[가-힣][^<]*</g) || []).length;
  const rows = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
  const out = ['# 아직 옮기지 않은 문구 (자동 집계)', '', '`node tools/i18n.js --todo` 가 다시 씁니다. 손으로 고치지 않습니다. 숫자는 어림입니다(날짜 읽기 규칙·검사용 글자가 섞여 있음).', '',
    `- 열쇠로 옮긴 문구: ${keys.size}개`, `- 스크립트에 남은 한국어 조각: 약 ${total}개 (함수 ${rows.length}곳)`, `- 화면에 박힌 채 data-t가 없는 글자: 약 ${hk}곳`, '', '| 함수 | 남은 조각 | 예 |', '|---|---|---|']
    .concat(rows.slice(0, 60).map(([k, n]) => `| \`${k}\` | ${n} | ${[...new Set(ex[k])].slice(0, 2).map(x => x.slice(0, 18).replace(/\|/g, '/')).join(' · ')} |`));
  fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'docs', 'i18n-todo.md'), out.join('\n') + '\n'); console.log(`docs/i18n-todo.md: 남은 조각 약 ${total}개`); }
if (process.argv.includes('--check') && bad) process.exit(1);
