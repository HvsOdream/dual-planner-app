// 실제 서버(운영 모델)로 주간 리뷰·역할 묶기를 돌려 답과 토큰 사용량을 로그에 남긴다. 페르소나 테스트의 서버 응답 수집용.
// 사용: node eval/run-live.mjs
import fs from 'node:fs';
const API = process.env.API || 'https://dual-planner-api.withsky0.workers.dev';
const rc = JSON.parse(fs.readFileSync(new URL('./review_cases.json', import.meta.url)));
const gc = JSON.parse(fs.readFileSync(new URL('./group_cases.json', import.meta.url)));
const tok = p => 'live' + p.replace(/[^a-z0-9]/g, '') + Math.random().toString(36).slice(2, 12) + 'x0';
const post = async (t, path, body) => { const t0 = Date.now(); const r = await fetch(`${API}/u/${t}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); j._status = r.status; j._ms = Date.now() - t0; return j; };
const mk = async p => { const t = tok(p); await fetch(`${API}/u/${t}/state`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rocks: [], days: {}, settings: {} }) }); return t; };
const evId = t => { let h = 0; for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) | 0; return 'e' + (h >>> 0).toString(36); };
const tot = {};
const add = (kind, u) => (u || []).forEach(c => { const k = kind + ' ' + c.model, m = tot[k] = tot[k] || { n: 0, in: 0, out: 0 }; m.n++; m.in += c.in; m.out += c.out; });
const rk = Object.keys(rc);
for (let i = 0; i < rk.length; i += 6) await Promise.all(rk.slice(i, i + 6).map(async k => { const j = await post(await mk(k), 'review', rc[k]); add('review', j.usage); console.log('LIVE review', k, JSON.stringify(j)); }));
await Promise.all(Object.values(gc).map(async p => {
  const t = await mk(p.key), items = p.items.map(([id, title]) => ({ id, title })).concat(p.ev.map(x => ({ id: evId(x), title: '[일정] ' + x })));
  const a = await post(t, 'group', { items, roles: [], people: {} }); add('group', a.usage);
  const ans = {}; (a.people || []).forEach(x => { ans[x.name] = p.people[x.name] || p.people[x.name.split(' ')[0]] || '모름'; });
  let b = a; if (Object.values(ans).some(v => v !== '모름')) { b = await post(t, 'group', { items, roles: [], people: ans }); add('group', b.usage); }
  console.log('LIVE group', p.key, JSON.stringify({ a, b, ans }));
}));
for (const [k, m] of Object.entries(tot)) console.log('TOKENS', k, JSON.stringify({ ...m, avgIn: Math.round(m.in / m.n), avgOut: Math.round(m.out / m.n) }));
