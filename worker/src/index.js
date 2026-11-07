// DUAL Planner API + MCP — Cloudflare Worker (KV: PLANNER)
// 경로:  /u/:token/state (GET 전체, PUT 병합 저장)
//        /u/:token/items (POST 비서가 항목 추가/수정)
//        /u/:token/mcp   (MCP Streamable HTTP: planner_read / planner_add / planner_update)
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,PUT,OPTIONS', 'access-control-allow-headers': 'content-type,authorization,mcp-session-id,mcp-protocol-version', 'access-control-expose-headers': 'mcp-session-id' };
const json = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS, ...h } });
const DOW = ['월','화','수','목','금','토','일'];
const BUCKETS = { urgent:'urgent', important:'important', light:'light', nice:'nice', a:'urgent', b:'important', c:'light', d:'nice', '급하고 꼭':'urgent', '꼭 해야':'important', '급하지만 가벼운':'light', '하면 좋은':'nice' };
const KST = 9 * 3600 * 1000;
const nowKST = () => new Date(Date.now() + KST);
const dstr = d => d.toISOString().slice(0, 10);
const today = () => dstr(nowKST());
function weekKey(d) { const x = new Date(d); x.setUTCDate(x.getUTCDate() - (x.getUTCDay() + 6) % 7); return dstr(x); }
const uid = p => (p || 'r_') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const empty = () => ({ v: 1, roles: [], rocks: [], days: {}, reviews: {}, seen: {}, _modified: '' });

// ── 병합: rocks는 id별 u(수정시각) 최신, days/reviews는 키별 u 최신, roles는 최신 쪽, seen은 합집합 ──
function merge(a, b) {
  a = Object.assign(empty(), a || {}); b = Object.assign(empty(), b || {});
  const out = empty();
  const rm = new Map(); [...a.rocks, ...b.rocks].forEach(r => { if (!r || !r.id) return; const p = rm.get(r.id); if (!p || (r.u || '') >= (p.u || '')) rm.set(r.id, r); });
  out.rocks = [...rm.values()];
  for (const k of new Set([...Object.keys(a.days), ...Object.keys(b.days)])) { const x = a.days[k], y = b.days[k]; out.days[k] = !x ? y : !y ? x : ((y.u || '') >= (x.u || '') ? y : x); }
  for (const k of new Set([...Object.keys(a.reviews), ...Object.keys(b.reviews)])) { const x = a.reviews[k], y = b.reviews[k]; out.reviews[k] = !x ? y : !y ? x : ((y.u || '') >= (x.u || '') ? y : x); }
  out.roles = ((b._modified || '') >= (a._modified || '') ? b : a).roles || [];
  out.seen = Object.assign({}, a.seen, b.seen);
  out._modified = [a._modified, b._modified].sort().pop() || '';
  return out;
}

// ── 비서가 쓰는 항목 추가/수정 ──
function applyItems(S, items, src) {
  const now = new Date().toISOString(), td = today(), wk = weekKey(nowKST());
  const added = [], updated = [];
  (items || []).forEach(it => {
    if (!it || typeof it !== 'object') return;
    if (it.id && it.op === 'update') {
      const r = S.rocks.find(x => x.id === it.id); if (!r) return;
      ['title', 'role', 'due', 'routine', 'done', 'tomb'].forEach(k => { if (k in it) r[k] = it[k]; });
      if ('bucket' in it) r.bucket = BUCKETS[String(it.bucket).toLowerCase()] || r.bucket;
      if (it.done) r.doneAt = r.doneAt || td;
      r.u = now; updated.push(r.id); return;
    }
    const text = String(it.text || it.title || '').trim(); if (!text) return;
    const kind = String(it.kind || (it.bucket ? 'item' : 'todo')).toLowerCase();
    if (kind === 'note' || kind === 'todo') {
      const day = S.days[td] || (S.days[td] = { intent: '', note: '', picks: [], inbox: [] });
      day.inbox = day.inbox || []; const id = it.id || uid('i_');
      day.inbox.unshift({ id, text, kind, src, at: nowKST().toISOString().slice(11, 16), role: it.role || '' }); day.u = now; added.push(id);
    } else if (kind === 'candidate') {
      const rv = S.reviews[wk] || (S.reviews[wk] = { candidates: [] }); rv.candidates = rv.candidates || [];
      const id = it.id || uid('c_'); const c = { id, role: it.role || '', title: text, state: null, src };
      if (it.routine) c.routine = Number(it.routine); else c.due = it.due || '';
      rv.candidates.unshift(c); rv.u = now; added.push(id);
    } else { // item → 할 일 목록에 직접 적기
      const bucket = BUCKETS[String(it.bucket || 'nice').toLowerCase()] || 'nice';
      const id = it.id || uid();
      const r = { id, week: wk, bucket, role: it.role || '', title: text, done: false, carry: 0, checks: {}, src, u: now };
      if (it.routine) r.routine = Number(it.routine); if (it.due) r.due = it.due;
      S.rocks.push(r); added.push(id);
    }
  });
  S._modified = now;
  return { added, updated };
}

// ── 비서가 읽는 요약 ──
function summary(S) {
  const td = today(), wk = weekKey(nowKST()), ds = []; const ws = new Date(wk); for (let i = 0; i < 7; i++) { const x = new Date(ws); x.setUTCDate(x.getUTCDate() + i); ds.push(dstr(x)); }
  const live = S.rocks.filter(r => r && !r._deleted && !r.tomb);
  const openI = live.filter(r => !r.done);
  const names = { urgent: 'A 급하고 꼭', important: 'B 꼭 해야(장기)', light: 'C 급하지만 가벼운', nice: 'D 하면 좋은 일' };
  const lines = [`# DUAL Planner · ${td} · W${wk}`, `역할: ${(S.roles || []).join(' / ')}`, ''];
  ['urgent', 'important', 'light', 'nice'].forEach(b => { lines.push(`## ${names[b]}`); openI.filter(r => (r.bucket || 'nice') === b).forEach(r => lines.push(`- id=${r.id} (${r.role}) ${r.title}${r.due ? ' — ' + r.due + '까지만' : ''}${r.routine ? ' — 주 ' + r.routine + '회, 이번 주 ' + Object.keys(r.checks || {}).filter(k => ds.includes(k)).length : ''}`)); lines.push(''); });
  const day = S.days[td]; if (day) { lines.push('## 오늘', `의도: ${day.intent || '-'}`, `오늘 고른 것: ${(day.picks || []).map(id => (live.find(r => r.id === id) || {}).title).filter(Boolean).join(', ') || '-'}`, `저녁 한 줄: ${day.note || '-'}`, ''); const inbox = (day.inbox || []).filter(x => !x.moved); if (inbox.length) { lines.push('## 인박스(아직 안 옮긴 것)'); inbox.forEach(x => lines.push(`- ${x.kind}: ${x.text}`)); lines.push(''); } }
  const doneW = live.filter(r => r.done && ds.includes(r.doneAt || '')); if (doneW.length) { lines.push('## 이번 주 완료'); doneW.forEach(r => lines.push(`- ${r.title} (${r.doneAt})`)); lines.push(''); }
  const cut = dstr(new Date(nowKST().getTime() - 14 * 86400000));
  const stale = openI.filter(r => !r.routine && (Object.keys(r.checks || {}).sort().pop() || r.week || '') < cut); if (stale.length) { lines.push('## 2주 넘게 안 건드린 것'); stale.forEach(r => lines.push(`- id=${r.id} ${r.title}`)); }
  return lines.join('\n');
}

// ── MCP ──
const TOOLS = [
  { name: 'planner_read', description: '플래너 현재 상태 요약(역할, A/B/C/D 할 일 목록과 id, 오늘 의도·고른 것·한 줄, 인박스, 이번 주 완료, 2주 방치 항목). 정리·제안 전에 먼저 읽는다.', inputSchema: { type: 'object', properties: {} } },
  { name: 'planner_add', description: '비서가 플래너에 적는다. items 배열. 각 항목: text(필수), kind = item(할 일 목록에 바로 적음, bucket 필수: A|B|C|D) | todo(오늘 인박스 할 일) | note(오늘 인박스 메모) | candidate(일요일 리뷰용 다음 주 B 후보). role(역할명), due(YYYY-MM-DD, B는 필수), routine(주 N회 숫자).', inputSchema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, kind: { type: 'string', enum: ['item', 'todo', 'note', 'candidate'] }, bucket: { type: 'string', description: 'A|B|C|D' }, role: { type: 'string' }, due: { type: 'string' }, routine: { type: 'number' } }, required: ['text'] } } }, required: ['items'] } },
  { name: 'planner_update', description: '기존 할 일 항목 수정. items 배열, 각 항목 id 필수. 바꿀 필드만: title, bucket(A|B|C|D), role, due, routine, done(true/false), tomb(true=묘비·목록에서 치움).', inputSchema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, bucket: { type: 'string' }, role: { type: 'string' }, due: { type: 'string' }, routine: { type: 'number' }, done: { type: 'boolean' }, tomb: { type: 'boolean' } }, required: ['id'] } } }, required: ['items'] } },
];
async function mcp(req, env, token) {
  if (req.method === 'GET') return new Response('Method Not Allowed', { status: 405, headers: CORS });
  if (req.method === 'DELETE') return new Response(null, { status: 204, headers: CORS });
  let msg; try { msg = await req.json(); } catch { return json({ jsonrpc: '2.0', error: { code: -32700, message: 'parse error' }, id: null }, 400); }
  const batch = Array.isArray(msg) ? msg : [msg]; const out = [];
  for (const m of batch) {
    if (!m || m.id === undefined) continue; // notifications
    const reply = r => out.push({ jsonrpc: '2.0', id: m.id, result: r });
    try {
      if (m.method === 'initialize') reply({ protocolVersion: m.params && m.params.protocolVersion || '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'dual-planner', version: '0.1' } });
      else if (m.method === 'ping') reply({});
      else if (m.method === 'tools/list') reply({ tools: TOOLS });
      else if (m.method === 'tools/call') {
        const name = m.params && m.params.name, args = (m.params && m.params.arguments) || {};
        const S = Object.assign(empty(), JSON.parse(await env.PLANNER.get('u:' + token) || 'null') || {});
        let text;
        if (name === 'planner_read') text = summary(S);
        else if (name === 'planner_add' || name === 'planner_update') { const items = (args.items || []).map(x => name === 'planner_update' ? Object.assign({ op: 'update' }, x) : x); const r = applyItems(S, items, 'mcp'); await env.PLANNER.put('u:' + token, JSON.stringify(S)); text = `적었어요 — 추가 ${r.added.length}, 수정 ${r.updated.length}`; }
        else { out.push({ jsonrpc: '2.0', id: m.id, error: { code: -32602, message: 'unknown tool' } }); continue; }
        reply({ content: [{ type: 'text', text }] });
      } else out.push({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'method not found' } });
    } catch (e) { out.push({ jsonrpc: '2.0', id: m.id, error: { code: -32000, message: String(e && e.message || e) } }); }
  }
  if (!out.length) return new Response(null, { status: 202, headers: CORS });
  return json(Array.isArray(msg) ? out : out[0], 200, { 'mcp-session-id': token.slice(0, 8) });
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/u\/([A-Za-z0-9_-]{16,64})\/(state|items|mcp)\/?$/);
    if (!m) return json({ ok: true, name: 'dual-planner-api', usage: '/u/:token/state | /u/:token/items | /u/:token/mcp' });
    const token = m[1], kind = m[2], key = 'u:' + token;
    if (kind === 'mcp') return mcp(req, env, token);
    const cur = Object.assign(empty(), JSON.parse(await env.PLANNER.get(key) || 'null') || {});
    if (kind === 'state') {
      if (req.method === 'GET') return json(cur);
      if (req.method === 'PUT') { let body; try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); } const S = merge(cur, body); await env.PLANNER.put(key, JSON.stringify(S)); return json(S); }
      return json({ error: 'method' }, 405);
    }
    if (kind === 'items') {
      if (req.method !== 'POST') return json({ error: 'method' }, 405);
      let body; try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
      const r = applyItems(cur, Array.isArray(body) ? body : (body.items || []), body.src || 'api');
      await env.PLANNER.put(key, JSON.stringify(cur)); return json({ ok: true, ...r });
    }
    return json({ error: 'not found' }, 404);
  }
};
