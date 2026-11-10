// 역할 묶기 모델 비교: 같은 시험지(group_cases.json)를 모델마다 실제 서버로 REPS번씩 돌리고 자동 채점한다
// 채점은 역할 이름이 아니라 구조를 본다: 같이 묶여야 할 일, 갈라져야 할 일, 있어야 할 역할, 나오면 안 되는 역할, 그리고 반복했을 때 결과가 같은지
// 사용: node eval/run-group.mjs "claude-haiku-5-5,@cf/meta/llama-3.3-70b-instruct-fp8-fast" [반복수]
import fs from 'node:fs';
const API = process.env.API || 'https://dual-planner-api.withsky0.workers.dev';
const cases = JSON.parse(fs.readFileSync(new URL('./group_cases.json', import.meta.url)));
const models = (process.argv[2] || '').split(',').map(s => s.trim()).filter(Boolean), REPS = Number(process.argv[3] || 3), ME = process.argv[4] === 'me'; // me: '하는 일' 한 줄을 같이 보낸다
const evId = t => { let h = 0; for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) | 0; return 'e' + (h >>> 0).toString(36); };
const rid = x => x.startsWith('ev:') ? evId(x.slice(3)) : x;
const post = async (t, body) => { const t0 = Date.now(); try { const r = await fetch(`${API}/u/${t}/group`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); j._status = r.status; j._ms = Date.now() - t0; return j; } catch (e) { return { _status: 0, _ms: Date.now() - t0, error: String(e) }; } };
async function one(p, model) {
  const t = 'evg' + p.key + Math.random().toString(36).slice(2, 12) + 'x0';
  await fetch(`${API}/u/${t}/state`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rocks: [], days: {}, settings: {} }) });
  const items = p.items.map(([id, title]) => ({ id, title })).concat(p.ev.map(x => ({ id: evId(x), title: '[일정] ' + x })));
  const me = ME ? p.me || '' : '';
  const a = await post(t, { items, roles: [], people: {}, model, me });
  const ans = {}; (a.people || []).forEach(x => { const v = p.people[x.name] || p.people[x.name.split(' ')[0]]; if (v) ans[x.name] = v; });
  const b = Object.keys(ans).length ? await post(t, { items, roles: [], people: ans, model, me }) : a;
  const groups = b.groups || [], of = {}; groups.forEach((g, i) => g.ids.forEach(id => { of[id] = i; }));
  const G = p.gold, names = groups.map(g => g.name);
  const frac = (arr, f) => arr.length ? arr.filter(f).length / arr.length : 1;
  const s = {
    valid: groups.length ? 1 : 0,
    cover: frac(p.items, ([id]) => of[id] !== undefined),
    together: frac(G.together, set => { const g = set.map(x => of[rid(x)]); return g.every(x => x !== undefined && x === g[0]); }),
    apart: frac(G.apart, ([x, y]) => of[rid(x)] !== undefined && of[rid(y)] !== undefined && of[rid(x)] !== of[rid(y)]),
    must: frac(G.must, re => names.some(n => new RegExp(re, 'i').test(n))),
    ban: G.ban.some(re => names.some(n => new RegExp(re, 'i').test(n))) ? 0 : 1,
    count: groups.length >= 3 && groups.length <= 7 ? 1 : 0,
    title: frac(G.meMust || [], re => names.some(n => new RegExp(re, 'i').test(n))), // 직함 보존(종합에는 안 넣음)
  };
  const use = [...(a.usage || []), ...(b !== a ? b.usage || [] : [])];
  return { s, names, ms: (a._ms || 0) + (b !== a ? b._ms || 0 : 0), ok: b._status === 200 && groups.length > 0, asked: (a.people || []).map(x => x.name), tin: use.reduce((n, c) => n + c.in, 0), tout: use.reduce((n, c) => n + c.out, 0), err: b.error || a.error || '' };
}
const jac = (x, y) => { const A = new Set(x), B = new Set(y), i = [...A].filter(v => B.has(v)).length, u = new Set([...A, ...B]).size; return u ? i / u : 1; };
const KEYS = ['valid', 'cover', 'together', 'apart', 'must', 'ban', 'count'];
let md = '| 모델 | 종합 | 같이 묶기 | 갈라 놓기 | 있어야 할 역할 | 금지 역할 없음 | 반복 일치 | 처음 본 사람 | 중앙 ms | 실패 | 평균 토큰(입/출) |\n|---|---|---|---|---|---|---|---|---|---|---|\n';
for (const m of models) {
  const jobs = []; for (const p of Object.values(cases)) for (let r = 0; r < REPS; r++) jobs.push([p, r]);
  const res = {};
  for (let i = 0; i < jobs.length; i += 8) await Promise.all(jobs.slice(i, i + 8).map(async ([p, r]) => { const o = await one(p, m); (res[p.key] = res[p.key] || []).push(o); console.log('OUT', m.split('/').pop(), p.key, r, JSON.stringify({ names: o.names, s: o.s, err: o.err })); }));
  const all = Object.values(res).flat(), avg = f => all.reduce((n, o) => n + f(o), 0) / all.length;
  const total = o => KEYS.reduce((n, k) => n + o.s[k], 0) / KEYS.length;
  const stab = Object.values(res).map(rs => { let n = 0, c = 0; for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { n += jac(rs[i].names, rs[j].names); c++; } return c ? n / c : 1; });
  const uns = Object.entries(res).filter(([k]) => cases[k].unseen).flatMap(([, v]) => v);
  const ms = all.map(o => o.ms).sort((a, b) => a - b), pc = x => Math.round(x * 100);
  const sum = { total: pc(avg(total)), together: pc(avg(o => o.s.together)), apart: pc(avg(o => o.s.apart)), must: pc(avg(o => o.s.must)), ban: pc(avg(o => o.s.ban)), title: pc(avg(o => o.s.title)), stable: pc(stab.reduce((a, b) => a + b, 0) / stab.length), unseen: pc(uns.reduce((n, o) => n + total(o), 0) / (uns.length || 1)), p50ms: ms[Math.floor(ms.length / 2)], fail: all.filter(o => !o.ok).length, tin: Math.round(avg(o => o.tin)), tout: Math.round(avg(o => o.tout)) };
  console.log('SUM', m, JSON.stringify(sum));
  md += `| ${m} | ${sum.total} | ${sum.together} | ${sum.apart} | ${sum.must} | ${sum.ban} | ${sum.stable} | ${sum.unseen} | ${sum.p50ms} | ${sum.fail} | ${sum.tin}/${sum.tout} |\n`;
}
console.log(md);
