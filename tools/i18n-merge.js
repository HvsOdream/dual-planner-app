// 이어 붙인 문장을 한 문장으로 합친다(반자동).  NODE_PATH=<acorn 설치 경로> node tools/i18n-merge.js [--dry]
//   md(d) + T('까지')  →  T('{d}까지', { d: md(d) })        '주 ' + n + T('회')  →  T('주 {n}회', { n })
//   한국어는 조사가 뒤에 붙고 영어는 앞에 오므로, 값과 글자를 한 열쇠로 묶어야 사전에서 순서를 바꿀 수 있다.
//   합치는 것: + 로 이어진 것 가운데 T('글자')가 하나 이상 있고, 나머지가 글자(태그 없음)나 짧은 값인 구간. 태그가 든 글자·템플릿에서 끊는다.
const fs = require('fs'), path = require('path'), acorn = require('acorn'), walk = require('acorn-walk');
const FILE = path.resolve(__dirname, '..', 'index.html'), dry = process.argv.includes('--dry');
const q = s => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
let total = 0;
for (let pass = 0; pass < 5; pass++) {
  const html = fs.readFileSync(FILE, 'utf8'), at = html.lastIndexOf('<script>') + 8, end = html.lastIndexOf('</script>'), js = html.slice(at, end);
  const ast = acorn.parse(js, { ecmaVersion: 'latest', sourceType: 'script', preserveParens: true }), src = n => js.slice(n.start, n.end), edits = [];
  const un = n => n.type === 'ParenthesizedExpression' ? un(n.expression) : n;
  const tlit = n => { n = un(n); return n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'T' && n.arguments.length === 1 && n.arguments[0].type === 'Literal' && typeof n.arguments[0].value === 'string' ? n.arguments[0].value : null; };
  const str = n => (n.type === 'Literal' && typeof n.value === 'string' ? n.value : null);
  const flat = n => (n.type === 'BinaryExpression' && n.operator === '+' ? flat(n.left).concat(flat(n.right)) : [n]);
  function name(e, used) { e = un(e); let n = e.type === 'Identifier' ? e.name : e.type === 'MemberExpression' && !e.computed && e.property.type === 'Identifier' ? e.property.name : e.type === 'CallExpression' && e.arguments.length === 1 && e.callee.type === 'Identifier' && /^(esc|md|kDate|String|Number|f|short)$/.test(e.callee.name) ? name(e.arguments[0], {}) : '';
    if (n === 'length') n = 'n'; if (!n || !/^[A-Za-z_]\w*$/.test(n) || n.length > 10) n = 'abcdefgh'[Object.keys(used).length] || 'v' + Object.keys(used).length;
    let k = n, i = 2; while (k in used) k = n + i++; used[k] = 1; return k; }
  walk.ancestor(ast, { BinaryExpression(n, anc) {
    if (n.operator !== '+') return; const p = anc[anc.length - 2]; if (p && p.type === 'BinaryExpression' && p.operator === '+') return; // 맨 바깥 + 만
    const ops = flat(n), kind = ops.map(o => tlit(o) !== null ? 'T' : str(o) !== null ? (/[<>]/.test(str(o)) ? 'X' : 'S') : o.type === 'TemplateLiteral' || /[<`]/.test(src(o)) || src(o).length > 90 ? 'X' : 'V');
    let i = 0; while (i < ops.length) { if (kind[i] === 'X') { i++; continue; } let j = i; while (j < ops.length && kind[j] !== 'X') j++; // [i, j) 한 구간
      let a = i, b = j - 1;
      const edge = k => kind[k] === 'S' && !str(ops[k]).trim(); while (a <= b && edge(a)) a++; while (b >= a && edge(b)) b--; // 가장자리 빈칸은 밖에 둔다
      const numish = o => /^(Identifier|MemberExpression|BinaryExpression)$/.test(un(o).type) || (un(o).type === 'Literal' && typeof un(o).value === 'number');
      while (a < b && kind[a] === 'V' && numish(ops[a]) && kind[a === 0 ? a + 1 : a - 1] === 'V') a++; // 숫자끼리 더하는 것일 수 있는 앞쪽 값은 건드리지 않는다
      while (b > a && kind[b] === 'V' && un(ops[b]).type === 'ConditionalExpression') b--; // 뒤에 덧붙는 조건부 꼬리는 문장 밖에 둔다
      const seg = ops.slice(a, b + 1), kk = kind.slice(a, b + 1);
      if (seg.length >= 2 && kk.includes('T') && (kk.includes('V') || kk.filter(x => x === 'T').length > 1)) {
        const used = {}, vs = []; let key = '';
        seg.forEach((o, x) => { if (kk[x] === 'T') key += tlit(o); else if (kk[x] === 'S') key += str(o); else { const k = name(o, used), s = src(o); key += '{' + k + '}'; vs.push(k === s ? k : k + ': ' + s); } });
        edits.push([seg[0].start, seg[seg.length - 1].end, 'T(' + q(key) + (vs.length ? ', { ' + vs.join(', ') + ' }' : '') + ')']); }
      i = j; } } });
  edits.sort((x, y) => x[0] - y[0] || y[1] - x[1]); const keep = [];
  for (const e of edits) { const o = keep.findIndex(k => e[0] < k[1] && e[1] > k[0]); if (o < 0) keep.push(e); else if (e[1] - e[0] < keep[o][1] - keep[o][0]) keep[o] = e; }
  if (!keep.length) break; let out = js; keep.sort((x, y) => y[0] - x[0]).forEach(([s, e, r]) => { if (pass === 0 || true) console.log('  ' + js.slice(s, e).replace(/\s+/g, ' ').slice(0, 70) + '  →  ' + r.slice(0, 80)); out = out.slice(0, s) + r + out.slice(e); });
  try { acorn.parse(out, { ecmaVersion: 'latest', sourceType: 'script' }); } catch (e) { console.log('✗ 문법 오류: ' + e.message); process.exit(1); }
  total += keep.length; if (dry) break; fs.writeFileSync(FILE, html.slice(0, at) + out + html.slice(end));
}
console.log(`합침 ${total}곳`);
