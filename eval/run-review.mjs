// 주간 리뷰 모델 비교: 같은 시험지(review_cases.json)를 모델마다 실제 서버로 돌리고 자동 채점한다
// 사용: node eval/run-review.mjs "@cf/meta/llama-3.3-70b-instruct-fp8-fast,@cf/openai/gpt-oss-120b"
import fs from 'node:fs';
const API = process.env.API || 'https://dual-planner-api.withsky0.workers.dev';
const cases = JSON.parse(fs.readFileSync(new URL('./review_cases.json', import.meta.url)));
const models = (process.argv[2] || '').split(',').map(s => s.trim()).filter(Boolean);
const tok = () => 'evalrv' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
const call = async (b, model) => {
  const t = tok();
  await fetch(`${API}/u/${t}/state`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rocks: [], days: {}, settings: {} }) });
  const t0 = Date.now();
  for (let i = 0; i < 2; i++) {
    try { const r = await fetch(`${API}/u/${t}/review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...b, model, raw: true }) }); const j = await r.json(); return { status: r.status, ms: Date.now() - t0, ...j }; }
    catch (e) { if (i) return { status: 0, error: String(e) }; }
  }
};
// ── 채점 규칙 ──
const words = t => String(t).toLowerCase().split(/[\s,.·()「」、。\/]+/).filter(w => w.length >= 2 && !/^(the|and|for|with|to|of|a|an|my|on|in|at|을|를|이|가|은|는|에|의)$/.test(w));
const langOf = t => { const ko = (t.match(/[가-힣]/g) || []).length, ja = (t.match(/[぀-ヿ]/g) || []).length, la = (t.match(/[A-Za-z]/g) || []).length; return ko >= (la + ja) / 2 ? 'ko' : ja > 0 ? 'ja' : 'en'; };
const foreign = (t, lang) => lang === 'ko' ? /[぀-ヿ一-鿿]/.test(t) : lang === 'ja' ? /[가-힣]/.test(t) : /[가-힣぀-ヿ一-鿿]/.test(t);
const BAN = /(왜|이유|원인|분석|현황 확인|다시 확인|여부 확인|해야 하는지|\bwhy\b|\breasons?\b|analy[sz]e|check (?:the )?status|re-?check|review again|confirm whether|理由|原因|分析)/i;
const BIG = /(1년치|한 권|전체|모두|끝내기|완성하기|\bentire\b|\bwhole\b|\bfinish\b|\bcomplete the\b|全部|完成させる)/i;
function firstOf(b) {
  const td = b.today, nx = b.next;
  const rank = x => { const d = x.due || '', over = d && d < td, b3 = d && !over && (new Date(d) - new Date(td)) / 864e5 <= 3; return (x.wait ? 9 : 0) + (over && x.bucket === 'urgent' ? 0 : over && x.bucket === 'important' ? 1 : over ? 2 : b3 ? 3 : x.bucket === 'urgent' ? 4 : x.bucket === 'important' ? 5 : 6); };
  return (b.open || []).slice().sort((x, y) => rank(x) - rank(y) || String(x.due || '9').localeCompare(String(y.due || '9')))[0];
}
function score(b, res) {
  const lang = langOf((b.open || []).concat(b.done || []).map(x => x.title).join(' '));
  const raw = (res.eval && res.eval.raw) || ''; let rj = null; try { const a = raw.indexOf('{'), z = raw.lastIndexOf('}'); rj = JSON.parse(raw.slice(a, z + 1)); } catch {}
  const rs = rj && String(rj.summary || ''), rc = (rj && Array.isArray(rj.cands) ? rj.cands : []).filter(c => c && c.title);
  const f = firstOf(b), nx = b.next, nxEnd = new Date(Date.parse(nx) + 6 * 864e5).toISOString().slice(0, 10);
  const fixed = (b.open || []).filter(x => x.due && x.due >= nx && x.due <= nxEnd && !x.wait);
  const hit = (t, item) => words(item.title).some(w => String(t).toLowerCase().includes(w));
  const s = {
    json: !!rj && !!rs,                                     // 형식대로 답했나
    first: !!rj && (!f || hit(rs, f)),                      // 먼저 볼 일을 요약에 짚었나
    firstCand: !!rj && (!f || rc.some(c => hit(c.title, f))),// 그 일의 첫 행동이 후보에 있나
    fixed: !!rj && fixed.every(x => rc.some(c => hit(c.title, x))), // 다음 주 마감이 후보에 있나
    noBan: !!rj && !rc.some(c => BAN.test(c.title)),        // 분석·확인형 없음
    noBig: !!rj && !rc.some(c => BIG.test(c.title)),        // 큰 단위 없음
    lang: !!rj && langOf(rs + rc.map(c => c.title).join(' ')) === lang && !foreign(rs + rc.map(c => c.title).join(' '), lang), // 언어 맞고 섞임 없음
    roles: !!rj && rc.every(c => !c.role || (b.roles || []).includes(c.role)), // 역할 이름 그대로
    n: rc.length >= 2,                                      // 후보 2개 이상
  };
  return { s, lang, raw: { summary: rs, cands: rc.map(c => c.title) }, final: { summary: res.summary, cands: (res.cands || []).map(c => c.title) }, ms: res.ms, status: res.status, error: res.error, detail: res.detail };
}
const out = {};
for (const m of models) {
  out[m] = {};
  const keys = Object.keys(cases);
  for (let i = 0; i < keys.length; i += 4) {
    await Promise.all(keys.slice(i, i + 4).map(async k => { const r = await call(cases[k], m); out[m][k] = score(cases[k], r || {}); }));
  }
  const rows = Object.values(out[m]), keysS = Object.keys(rows[0].s);
  const tot = Object.fromEntries(keysS.map(x => [x, rows.filter(r => r.s[x]).length]));
  const ms = rows.map(r => r.ms || 0).sort((a, b) => a - b);
  out[m]._summary = { n: rows.length, ...tot, total: keysS.reduce((a, x) => a + tot[x], 0), max: keysS.length * rows.length, p50ms: ms[Math.floor(ms.length / 2)], errors: rows.filter(r => r.status !== 200).length };
  console.log(m, JSON.stringify(out[m]._summary));
}
fs.mkdirSync('eval-out', { recursive: true });
fs.writeFileSync('eval-out/review-results.json', JSON.stringify(out, null, 1));
let md = '| 모델 | 형식 | 먼저볼일 | 그일 후보 | 다음주 마감 | 분석·확인형 없음 | 큰단위 없음 | 언어 | 역할 | 후보2+ | 합계 | 중앙 ms | 오류 |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
for (const m of models) { const x = out[m]._summary; md += `| ${m} | ${x.json} | ${x.first} | ${x.firstCand} | ${x.fixed} | ${x.noBan} | ${x.noBig} | ${x.lang} | ${x.roles} | ${x.n} | ${x.total}/${x.max} | ${x.p50ms} | ${x.errors} |\n`; }
fs.writeFileSync('eval-out/summary.md', md); console.log(md);
