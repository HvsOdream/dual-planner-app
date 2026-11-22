// 한국어 문구를 T()로 감싸는 도우미(반자동).  NODE_PATH=<acorn 설치 경로> node tools/i18n-wrap.js [--dry] 함수이름 …
//   index.html 본문 스크립트를 읽어, 이름을 준 함수 안의 한국어를 T('…')로 바꾼다. 한국어 화면은 달라지지 않아야 한다(T는 원문을 그대로 돌려준다).
//   감싸는 것: 템플릿 글자 안 태그 사이의 글(값이 끼어 있으면 {이름}으로), 태그 없는 템플릿 통째, placeholder·aria-label·title 값, 따옴표 문구
//   건드리지 않는 것: 비교·찾기에 쓰인 문구(=== , test, includes …), 따옴표 안에 태그가 든 문구, 이미 T()/N() 안에 있는 것 → 끝에 목록으로 알려 준다
const fs = require('fs'), path = require('path'), acorn = require('acorn'), walk = require('acorn-walk');
const ROOT = path.resolve(__dirname, '..'), FILE = path.join(ROOT, 'index.html'), html = fs.readFileSync(FILE, 'utf8');
const dry = process.argv.includes('--dry'), names = new Set(process.argv.slice(2).filter(a => !a.startsWith('--')));
const at = html.lastIndexOf('<script>') + 8, end = html.lastIndexOf('</script>'), js = html.slice(at, end);
const ast = acorn.parse(js, { ecmaVersion: 'latest', sourceType: 'script' });
const KO = /[가-힣]/, q = s => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
const src = n => js.slice(n.start, n.end), edits = [], left = [], frag = [];
const simple = e => { const s = src(e); return s.length <= 90 && !/[<`]/.test(s); };
function varName(e, used) { let n = e.type === 'Identifier' ? e.name : e.type === 'MemberExpression' && !e.computed && e.property.type === 'Identifier' ? e.property.name : e.type === 'CallExpression' && e.arguments.length === 1 && e.callee.type === 'Identifier' && /^(esc|md|kDate|String|Number)$/.test(e.callee.name) ? varName(e.arguments[0], {}) : '';
  if (n === 'length') n = 'n';
  if (!n || !/^[A-Za-z_]\w*$/.test(n) || n.length > 12) n = 'abcdefgh'[Object.keys(used).length] || 'v' + Object.keys(used).length;
  let k = n, i = 2; while (k in used) k = n + i++; used[k] = 1; return k; }
function call(parts) { // parts: 글자와 식이 번갈아. → T('…{a}…', { a: 식 })
  const used = {}, vs = []; let key = '';
  for (const p of parts) { if (typeof p === 'string') key += p; else { const k = varName(p, used), s = src(p); key += '{' + k + '}'; vs.push(k === s ? k : k + ': ' + s); } }
  return 'T(' + q(key) + (vs.length ? ', { ' + vs.join(', ') + ' }' : '') + ')'; }
function inT(anc) { return anc.some(a => a.type === 'CallExpression' && a.callee.type === 'Identifier' && /^[TN]$/.test(a.callee.name)); }
function template(tl, anc) {
  if (inT(anc) || !tl.quasis.some(x => KO.test(x.value.cooked || ''))) return;
  // 글자 흐름: 태그 밖의 글자·식을 한 줄로 이어 '글 한 덩이'를 찾는다
  const runs = []; let cur = null, inTag = false, inQ = false; const flush = () => { if (cur) runs.push(cur); cur = null; };
  tl.quasis.forEach((qu, i) => { const raw = qu.value.raw; let s = 0;
    for (let p = 0; p <= raw.length; p++) { const ch = raw[p];
      if (inTag && ch === '"' && raw[p - 1] !== '\\') inQ = !inQ; // 속성 값 안의 > (onclick의 => 등)는 태그 끝이 아니다
      if (p === raw.length || (!inTag && ch === '<' && /[a-zA-Z\/!]/.test(raw[p + 1] || '')) || (inTag && !inQ && ch === '>')) {
        if (!inTag && p > s) { (cur = cur || []).push({ t: raw.slice(s, p), start: qu.start + s, end: qu.start + p }); }
        if (p < raw.length) { if (!inTag) { flush(); inTag = true; inQ = false; } else { inTag = false; s = p + 1; } } } }
    const e = tl.expressions[i]; if (e) { if (!inTag) { if (simple(e)) (cur = cur || []).push({ e, start: e.start - 2, end: e.end + 1 }); else { if (cur && cur.some(x => x.t && KO.test(x.t))) frag.push(js.slice(cur[0].start, cur[cur.length - 1].end).slice(0, 60)); flush(); } } } });
  flush();
  const whole = runs.length === 1 && !/<[a-zA-Z\/]/.test(tl.quasis.map(x => x.value.raw).join('')) && runs[0][0].start === tl.quasis[0].start && runs[0][runs[0].length - 1].end >= tl.quasis[tl.quasis.length - 1].end;
  for (let run of runs) {
    let a = run.findIndex(x => x.t && KO.test(x.t)), b = run.length - 1 - [...run].reverse().findIndex(x => x.t && KO.test(x.t)); if (a < 0) continue;
    while (a > 0 && run[a - 1].e && !/^\s/.test(run[a].t)) a--; while (b < run.length - 1 && run[b + 1].e && !/\s$/.test(run[b].t)) b++; // 글자에 딱 붙은 값은 문장에 넣는다
    const cutOff = a > 0 || b < run.length - 1; // 문장 앞뒤에 남는 글자(' · ' 등)가 있으면 통째로 바꾸지 않는다(0.7.75에서 9곳이 떨어졌다)
    run = run.slice(a, b + 1);
    const first = run[0], last = run[run.length - 1], lead = first.t ? /^\s*/.exec(first.t)[0] : '', tail = last.t ? /\s*$/.exec(last.t)[0] : '';
    const cook = t => t.replace(/\\`/g, '`').replace(/\\\$/g, '$').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
    const parts = run.map((x, i) => x.e ? x.e : cook(x.t.slice(i === 0 ? lead.length : 0, x.t.length - (i === run.length - 1 ? tail.length : 0))));
    if (parts.some(p => typeof p === 'string' && /\\u|\\x/.test(p))) { left.push('이스케이프: ' + js.slice(first.start, last.end).slice(0, 60)); continue; }
    const c = call(parts);
    if (whole && !lead && !tail && !cutOff) { edits.push([tl.start, tl.end, c]); return; }
    edits.push([first.start + lead.length, last.end - tail.length, '${' + c + '}']); }
  // 태그 안의 placeholder·aria-label·title·alt
  tl.quasis.forEach(qu => { const re = /\b(placeholder|aria-label|title|alt)="([^"]*[가-힣][^"]*)"/g; let m; while ((m = re.exec(qu.value.raw))) { const s = qu.start + m.index + m[1].length + 2; if (!edits.some(([x, y]) => s < y && s + m[2].length > x)) edits.push([s, s + m[2].length, '${' + call([m[2]]) + '}']); } });
}
function literal(n, anc) {
  if (typeof n.value !== 'string' || !KO.test(n.value) || inT(anc)) return; const p = anc[anc.length - 2], line = () => js.slice(js.lastIndexOf('\n', n.start) + 1, n.end).trim().slice(-70);
  if (/<[a-zA-Z\/]/.test(n.value)) return left.push('따옴표 안 태그: ' + line());
  if (/=>|\)\s*;|\(.*\{/.test(n.value)) return left.push('따옴표 안 코드: ' + line());
  if (p.type === 'BinaryExpression' && /^[=!]==?$/.test(p.operator)) return left.push('비교: ' + line());
  if (p.type === 'Property' && p.key === n) return left.push('열쇠: ' + line());
  if (p.type === 'SwitchCase') return left.push('case: ' + line());
  if (p.type === 'CallExpression' && p.callee.type === 'MemberExpression' && /^(test|match|includes|indexOf|startsWith|endsWith|replace|split|search)$/.test(p.callee.property.name || '') ) return left.push('찾기: ' + line());
  if (p.type === 'MemberExpression' && p.object === n) return left.push('글자 다루기: ' + line());
  if (p.type === 'NewExpression') return left.push('new: ' + line());
  const t = n.value, lead = /^\s*/.exec(t)[0], tail = /\s*$/.exec(t)[0], core = t.slice(lead.length, t.length - tail.length);
  if (p.type === 'BinaryExpression' && p.operator === '+') frag.push(line());
  edits.push([n.start, n.end, (lead ? q(lead) + ' + ' : '') + 'T(' + q(core) + ')' + (tail ? ' + ' + q(tail) : '')]);
}
let found = 0;
walk.ancestor(ast, { TemplateLiteral(n, anc) { if (scope(anc) && !(anc[anc.length - 2] || {}).tag) template(n, anc); }, Literal(n, anc) { if (scope(anc)) literal(n, anc); } });
function scope(anc) { return anc.some(a => (a.type === 'FunctionDeclaration' && a.id && names.has(a.id.name)) || (a.type === 'VariableDeclarator' && a.id.type === 'Identifier' && names.has(a.id.name))); }
// 겹치는 고침은 바깥 것을 버린다(안쪽 템플릿이 먼저)
edits.sort((a, b) => a[0] - b[0] || b[1] - a[1]); const keep = [];
for (const e of edits) { const o = keep.findIndex(k => e[0] < k[1] && e[1] > k[0]); if (o < 0) keep.push(e); else if (e[1] - e[0] < keep[o][1] - keep[o][0]) keep[o] = e; }
let out = js; keep.sort((a, b) => b[0] - a[0]).forEach(([s, e, r]) => { out = out.slice(0, s) + r + out.slice(e); found++; });
try { acorn.parse(out, { ecmaVersion: 'latest', sourceType: 'script' }); } catch (e) { console.log('✗ 고친 결과가 문법에 안 맞습니다: ' + e.message); process.exit(1); }
console.log(`감쌈 ${found}곳 · 조각난 문장 ${frag.length} · 손으로 볼 것 ${left.length}`);
frag.forEach(f => console.log('  ~ ' + f)); left.forEach(f => console.log('  ? ' + f));
if (!dry) fs.writeFileSync(FILE, html.slice(0, at) + out + html.slice(end));
