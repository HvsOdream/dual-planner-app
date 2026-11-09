// DUAL Planner API + MCP — Cloudflare Worker (KV: PLANNER)
// 경로:  /u/:token/state (GET 전체, PUT 병합 저장)
//        /u/:token/items (POST 비서가 항목 추가/수정)
//        /u/:token/mcp   (MCP Streamable HTTP: planner_read / planner_add / planner_update)
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'access-control-allow-headers': 'content-type,authorization,mcp-session-id,mcp-protocol-version', 'access-control-expose-headers': 'mcp-session-id' };
const json = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS, ...h } });
const DOW = ['월','화','수','목','금','토','일'];
const BUCKETS = { urgent:'urgent', important:'important', light:'light', nice:'nice', a:'urgent', b:'important', c:'light', d:'nice', '급하고 꼭':'urgent', '꼭 해야':'important', '급하지만 가벼운':'light', '하면 좋은':'nice', '급함·중요':'urgent', '중요':'important', '급함':'light', '나중에':'nice' };
const KST = 9 * 3600 * 1000;
const nowKST = () => new Date(Date.now() + KST);
const dstr = d => d.toISOString().slice(0, 10);
const today = () => dstr(nowKST());
function weekKey(d) { const x = new Date(d); x.setUTCDate(x.getUTCDate() - (x.getUTCDay() + 6) % 7); return dstr(x); }
const uid = p => (p || 'r_') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const empty = () => ({ v: 1, roles: [], rocks: [], days: {}, reviews: {}, seen: {}, vols: [], agent: null, _modified: '' });

// ── 병합: rocks는 id별 u(수정시각) 최신, days/reviews는 키별 u 최신, roles는 최신 쪽, seen은 합집합 ──
function merge(a, b) {
  a = Object.assign(empty(), a || {}); b = Object.assign(empty(), b || {});
  const out = empty();
  const rm = new Map(); [...a.rocks, ...b.rocks].forEach(r => { if (!r || !r.id) return; const p = rm.get(r.id); if (!p || (r.u || '') >= (p.u || '')) rm.set(r.id, r); });
  out.rocks = [...rm.values()];
  for (const k of new Set([...Object.keys(a.days), ...Object.keys(b.days)])) { const x = a.days[k], y = b.days[k]; out.days[k] = !x ? y : !y ? x : ((y.u || '') >= (x.u || '') ? y : x); }
  for (const k of new Set([...Object.keys(a.reviews), ...Object.keys(b.reviews)])) { const x = a.reviews[k], y = b.reviews[k]; out.reviews[k] = !x ? y : !y ? x : ((y.u || '') >= (x.u || '') ? y : x); }
  const vm = new Map(); [...(a.vols || []), ...(b.vols || [])].forEach(v => { if (!v || !v.id) return; const p = vm.get(v.id); if (!p || (v.u || '') >= (p.u || '')) vm.set(v.id, v); }); out.vols = [...vm.values()];
  out.roles = ((b._modified || '') >= (a._modified || '') ? b : a).roles || [];
  out.seen = Object.assign({}, a.seen, b.seen);
  out.settings = (((b.settings || {}).u || '') >= ((a.settings || {}).u || '') ? b.settings : a.settings) || {};
  out.agent = [a.agent, b.agent].filter(Boolean).sort((x, y) => (x.at || '') < (y.at || '') ? -1 : 1).pop() || null;
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
    } else if (kind === 'yearreview') {
      const v = (S.vols || []).filter(x => x && !x.closedAt && !x._deleted).sort((x, y) => x.start < y.start ? -1 : 1).pop();
      if (v) { v.summary = text; v.u = now; added.push('yearreview'); }
    } else if (kind === 'review') {
      const rv = S.reviews[wk] || (S.reviews[wk] = { candidates: [] }); rv.summary = text; rv.summaryBy = src; rv.u = now; added.push('review');
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
  const names = { urgent: 'A 급함·중요', important: 'B 중요(장기)', light: 'C 급함', nice: 'D 나중에' };
  const cv = (S.vols || []).filter(x => x && !x.closedAt && !x._deleted).sort((x, y) => x.start < y.start ? -1 : 1).pop();
  const lines = [`# DUAL Planner · ${td} · W${wk}`, `역할: ${(S.roles || []).join(' / ')}`, cv ? `지금 속지: ${cv.start}부터 12개월 · 목표: ${(cv.goals || []).join(' / ') || '-'}` : '', ''];
  ['urgent', 'important', 'light', 'nice'].forEach(b => { lines.push(`## ${names[b]}`); openI.filter(r => (r.bucket || 'nice') === b).forEach(r => lines.push(`- id=${r.id} (${r.role}) ${r.title}${r.due ? ' — ' + r.due + '까지만' : ''}${r.routine ? ' — 주 ' + r.routine + '회, 이번 주 ' + Object.keys(r.checks || {}).filter(k => ds.includes(k)).length : ''}`)); lines.push(''); });
  const day = S.days[td]; if (day) { lines.push('## 오늘', `의도: ${day.intent || '-'}`, `오늘 고른 것: ${(day.picks || []).map(id => (live.find(r => r.id === id) || {}).title).filter(Boolean).join(', ') || '-'}`, `저녁 한 줄: ${day.note || '-'}`, ''); const inbox = (day.inbox || []).filter(x => !x.moved); if (inbox.length) { lines.push('## 인박스(아직 안 옮긴 것)'); inbox.forEach(x => lines.push(`- ${x.kind}: ${x.text}`)); lines.push(''); } }
  lines.push('## 이번 주 일별 기록 (달력)');
  ds.forEach((d, i) => { if (d > td) return; const dy = S.days[d] || {}; const done = live.filter(r => (r.checks && r.checks[d]) || r.doneAt === d).map(r => r.title); const notes = (dy.inbox || []).filter(x => x.kind === 'note').map(x => x.text);
    lines.push(`- ${d.slice(5)} ${DOW[i]} · 의도: ${dy.intent || '-'} · 한 일(${done.length}): ${done.join(', ') || '-'}${notes.length ? ' · 메모: ' + notes.join(' / ') : ''} · 한 줄: ${dy.note || '-'}`); });
  lines.push('');
  const cut = dstr(new Date(nowKST().getTime() - 14 * 86400000));
  const stale = openI.filter(r => !r.routine && (Object.keys(r.checks || {}).sort().pop() || r.week || '') < cut); if (stale.length) { lines.push('## 2주 넘게 안 건드린 것'); stale.forEach(r => lines.push(`- id=${r.id} ${r.title}`)); }
  return lines.join('\n');
}

// ── MCP ──
const INSTRUCTIONS = `DUAL Planner — 사용자의 노트형 플래너. 앱은 사용자의 정리 양식이고, 정리는 비서(너)가 한다.
1) 플래너 관련 대화나 일을 시작하면 planner_read로 먼저 읽는다(역할, A/B/C/D 할 일, 오늘, 이번 주 일별 기록, 방치 항목).
2) 대화 중 생긴 할 일·결정은 대화 끝에 한 번에 planner_add로 적는다. 분류해서 적어라: kind=item + bucket A(급함·중요) | B(중요한 장기 일, due 필수) | C(급함, 가벼운 일) | D(나중에). role은 사용자 역할 중 하나, 루틴은 routine=주당 횟수. 결정·메모는 kind=note.
3) 끝난 일은 planner_update로 done=true. 2주 넘게 방치된 것은 분할·묘비를 제안만 하고, 사용자 허락 없이 tomb 하지 않는다.
4) "속지 1년 리뷰" 요청: 속지 기간의 기록을 읽고(필요하면 사용자에게 달력 요약을 물어) 5~8문장 1년 리뷰를 kind=yearreview로 적는다.
5) "주간 리뷰" 요청이나 일요일: planner_read의 일별 기록을 근거로 3~5문장 리뷰를 kind=review로 적고, 다음 주 B 후보를 kind=candidate(due 필수)로 최대 4개 적는다. 채택은 사용자가 앱에서 한다.
6) 적은 뒤엔 무엇을 어느 칸에 적었는지 한 줄로 알려 준다.`;
const TOOLS = [
  { name: 'planner_read', description: '(플래너 일을 시작할 때 먼저 호출) 플래너 현재 상태 요약(역할, A/B/C/D 할 일 목록과 id, 오늘 의도·고른 것·한 줄, 인박스, 이번 주 완료, 2주 방치 항목). 정리·제안 전에 먼저 읽는다.', inputSchema: { type: 'object', properties: {} } },
  { name: 'planner_add', description: '비서가 플래너에 적는다. items 배열. 각 항목: text(필수), kind = item(할 일 목록에 바로 적음, bucket 필수: A|B|C|D) | todo(오늘 인박스 할 일) | note(오늘 인박스 메모) | candidate(일요일 리뷰용 다음 주 B 후보) | review(이번 주 리뷰 3~5문장, text에) | yearreview(지금 속지 1년 리뷰, text에). role(역할명), due(YYYY-MM-DD, B는 필수), routine(주 N회 숫자).', inputSchema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, kind: { type: 'string', enum: ['item', 'todo', 'note', 'candidate', 'review', 'yearreview'] }, bucket: { type: 'string', description: 'A|B|C|D' }, role: { type: 'string' }, due: { type: 'string' }, routine: { type: 'number' } }, required: ['text'] } } }, required: ['items'] } },
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
      if (m.method === 'initialize') { const ci = (m.params && m.params.clientInfo) || {}; const S0 = Object.assign(empty(), JSON.parse(await env.PLANNER.get('u:' + token) || 'null') || {}); S0.agent = { name: ci.name || 'agent', version: ci.version || '', at: new Date().toISOString(), via: 'mcp' }; await env.PLANNER.put('u:' + token, JSON.stringify(S0)); }
      if (m.method === 'initialize') reply({ protocolVersion: m.params && m.params.protocolVersion || '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'dual-planner', version: '0.2' }, instructions: INSTRUCTIONS });
      else if (m.method === 'ping') reply({});
      else if (m.method === 'tools/list') reply({ tools: TOOLS });
      else if (m.method === 'tools/call') {
        const name = m.params && m.params.name, args = (m.params && m.params.arguments) || {};
        const S = Object.assign(empty(), JSON.parse(await env.PLANNER.get('u:' + token) || 'null') || {});
        let text;
        S.agent = Object.assign({}, S.agent || { name: 'agent', via: 'mcp' }, { at: new Date().toISOString(), last: name });
        if (name === 'planner_read') { await env.PLANNER.put('u:' + token, JSON.stringify(S)); }
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

// ── 로그인(애플·구글): 각 회사가 서명한 ID 토큰을 공개키로 검증하고, 계정 ↔ 플래너 토큰을 잇는다 ──
// KV: a:<provider>:<sub> → {token, provider, email, name, created} · acct:<token> → a:<provider>:<sub>
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const b64url = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return s; };
const b64bytes = s => Uint8Array.from(atob(b64url(s)), c => c.charCodeAt(0));
const b64json = s => JSON.parse(new TextDecoder().decode(b64bytes(s)));
function newToken() { const a = new Uint8Array(18); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
async function verifyJwt(jwt, jwksUrl, issuers, aud) {
  const parts = String(jwt || '').split('.'); if (parts.length !== 3) throw new Error('bad token');
  const [h, p, sig] = parts; const header = b64json(h), payload = b64json(p);
  if (header.alg !== 'RS256') throw new Error('bad alg');
  const jwks = await (await fetch(jwksUrl, { cf: { cacheTtl: 3600, cacheEverything: true } })).json();
  const jwk = (jwks.keys || []).find(k => k.kid === header.kid); if (!jwk) throw new Error('unknown key');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64bytes(sig), new TextEncoder().encode(h + '.' + p));
  if (!ok) throw new Error('bad signature');
  if (!issuers.includes(payload.iss)) throw new Error('bad issuer');
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud]; const want = Array.isArray(aud) ? aud : [aud]; if (!auds.some(a => want.includes(a))) throw new Error('bad audience');
  if (!payload.exp || payload.exp * 1000 < Date.now() - 60000) throw new Error('expired');
  if (!payload.sub) throw new Error('no subject');
  return payload;
}
const PROVIDERS = {
  google: env => env.GOOGLE_CLIENT_ID && { jwks: 'https://www.googleapis.com/oauth2/v3/certs', iss: ['accounts.google.com', 'https://accounts.google.com'], aud: env.GOOGLE_CLIENT_ID },
  apple: env => env.APPLE_SERVICES_ID && { jwks: 'https://appleid.apple.com/auth/keys', iss: ['https://appleid.apple.com'], aud: [env.APPLE_SERVICES_ID, env.APPLE_APP_ID || 'com.hvsodream.dualplanner'] },
};
async function auth(req, env, path) {
  if (path === 'config') return json({ google: env.GOOGLE_CLIENT_ID || null, apple: env.APPLE_SERVICES_ID || null });
  if (path === 'account') {
    if (req.method !== 'DELETE') return json({ error: 'method' }, 405);
    const tok = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!TOKEN_RE.test(tok)) return json({ error: 'no token' }, 401);
    const ak = await env.PLANNER.get('acct:' + tok);
    await env.PLANNER.delete('u:' + tok); await env.PLANNER.delete('acct:' + tok); if (ak) await env.PLANNER.delete(ak);
    for (const k of await kvKeys(env, 'p:' + tok + ':', 2000)) await env.PLANNER.delete(k);
    return json({ ok: true, deleted: true });
  }
  const conf = PROVIDERS[path] && PROVIDERS[path](env);
  if (!conf) return json({ error: 'provider not configured' }, 503);
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let body; try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  let claims; try { claims = await verifyJwt(body.credential || body.id_token, conf.jwks, conf.iss, conf.aud); } catch (e) { return json({ error: 'login failed', reason: String(e.message || e) }, 401); }
  const ak = `a:${path}:${claims.sub}`;
  let acct = JSON.parse(await env.PLANNER.get(ak) || 'null');
  if (!acct) {
    // 처음 로그인: 이 기기에서 쓰던 토큰이 아직 다른 계정에 묶여 있지 않으면 그대로 이어 쓴다(데이터·비서 연결 주소 유지)
    let tok = TOKEN_RE.test(body.token || '') && !(await env.PLANNER.get('acct:' + body.token)) ? body.token : newToken();
    acct = { token: tok, provider: path, email: claims.email || '', name: (body.name || claims.name || '').trim(), created: new Date().toISOString() };
    await env.PLANNER.put(ak, JSON.stringify(acct)); await env.PLANNER.put('acct:' + tok, ak);
  } else if (!acct.email && claims.email) { acct.email = claims.email; await env.PLANNER.put(ak, JSON.stringify(acct)); }
  return json({ token: acct.token, account: { provider: acct.provider, email: acct.email, name: acct.name } });
}

// ── 관리자: 구글 로그인 + ADMIN_EMAILS 확인 후 숫자만 돌려준다(플래너 내용은 보내지 않음) ──
async function kvKeys(env, prefix, cap) { const out = []; let cursor; do { const r = await env.PLANNER.list({ prefix, cursor, limit: 1000 }); out.push(...r.keys.map(k => k.name)); cursor = r.list_complete ? null : r.cursor; } while (cursor && out.length < cap); return out.slice(0, cap); }
async function adminStats(req, env) {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const conf = PROVIDERS.google(env); if (!conf) return json({ error: 'google not configured' }, 503);
  let body; try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  let claims; try { claims = await verifyJwt(body.credential, conf.jwks, conf.iss, conf.aud); } catch (e) { return json({ error: 'login failed' }, 401); }
  const admins = String(env.ADMIN_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  if (!claims.email || !claims.email_verified || !admins.includes(String(claims.email).toLowerCase())) return json({ error: 'not admin' }, 403);
  const acctKeys = await kvKeys(env, 'a:', 2000), userKeys = await kvKeys(env, 'u:', 5000), fbKeys = await kvKeys(env, 'f:', 5000);
  const bound = new Set(), accounts = [];
  for (const k of acctKeys) {
    const a = JSON.parse(await env.PLANNER.get(k) || 'null'); if (!a) continue; bound.add(a.token);
    const S = JSON.parse(await env.PLANNER.get('u:' + a.token) || 'null') || {};
    const rocks = (S.rocks || []).filter(r => r && !r._deleted);
    accounts.push({ provider: a.provider, email: a.email || '', name: a.name || '', created: a.created || '', lastActive: S._modified || '', items: rocks.length, done: rocks.filter(r => r.done).length, days: Object.keys(S.days || {}).length, agent: S.agent ? { name: S.agent.name || '', at: S.agent.at || '' } : null, vols: (S.vols || []).filter(v => v && !v._deleted).length });
  }
  accounts.sort((x, y) => (y.created || '').localeCompare(x.created || ''));
  return json({ now: new Date().toISOString(), accounts, planners: userKeys.length, anonymous: userKeys.filter(k => !bound.has(k.slice(2))).length, feedback: fbKeys.length, admin: claims.email });
}

async function feedback(req, env, token) {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (!(await env.PLANNER.get('u:' + token))) return json({ error: 'unknown planner' }, 404);
  let b; try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  if (!b || b.consent !== true) return json({ error: 'no consent' }, 400);
  const rec = { at: new Date().toISOString(), kind: String(b.kind || 'roles').slice(0, 20), model: String(b.model || '').slice(0, 20), suggest: b.suggest || null, final: b.final || null, people: b.people || null };
  const s = JSON.stringify(rec); if (s.length > 20000) return json({ error: 'too big' }, 413);
  await env.PLANNER.put('f:' + rec.at.slice(0, 10) + ':' + token.slice(0, 8) + ':' + Math.random().toString(36).slice(2, 8), s, { expirationTtl: 31536000 });
  return json({ ok: true });
}

// ── 속지 비서: 작은 모델 하나로 묶기 등을 한다. LLM_URL(OpenAI 호환, 예: 직접 만든 sLLM)이 있으면 그쪽, 없으면 Workers AI ──
async function llm(env, messages, maxTokens) {
  if (env.LLM_URL) {
    const r = await fetch(env.LLM_URL.replace(/\/$/, '') + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (env.LLM_KEY || '') }, body: JSON.stringify({ model: env.LLM_MODEL || 'default', messages, temperature: 0.2, max_tokens: maxTokens || 600 }) });
    const j = await r.json(); return (((j.choices || [])[0] || {}).message || {}).content || '';
  }
  if (!env.AI) throw new Error('no model');
  const out = await env.AI.run(env.AI_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast', { messages, max_tokens: maxTokens || 600, temperature: 0.2 });
  if (typeof out === 'string') return out;
  if (out && typeof out.response === 'object') return JSON.stringify(out.response);
  return (out && (out.response || (((out.choices || [])[0] || {}).message || {}).content)) || JSON.stringify(out || '');
}
function jsonIn(text) { const a = text.indexOf('{'), b = text.lastIndexOf('}'); if (a < 0 || b <= a) return null; try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; } }
async function group(req, env, token) {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (!(await env.PLANNER.get('u:' + token))) return json({ error: 'unknown planner' }, 404);
  const dk = 'g:' + token + ':' + new Date().toISOString().slice(0, 10), used = Number(await env.PLANNER.get(dk) || 0);
  if (used >= 30) return json({ error: 'daily limit' }, 429);
  let body; try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const items = (body.items || []).filter(x => x && x.id && x.title).slice(0, 40).map(x => ({ id: String(x.id), title: String(x.title).slice(0, 80) }));
  const roles = (body.roles || []).map(String).slice(0, 12);
  const people = Object.entries(body.people || {}).slice(0, 20).map(([n, r]) => [String(n).slice(0, 10), String(r).slice(0, 10)]).filter(([n, r]) => n && r && r !== '모름');
  if (items.length < 3) return json({ groups: [] });
  const sys = [
    '너는 종이 플래너를 함께 쓰는 비서다. 할 일 목록을 보고, 이 사람이 삶에서 맡고 있는 "역할"을 찾아 할 일을 역할별로 묶는다.',
    '역할은 일의 주제가 아니라 그 일을 하는 사람의 자리다. 단어보다 목적을 본다: 누구를 위해, 어떤 책임으로 하는 일인가.',
    '"부모"는 내가 아이를 키우는 자리다. 내 엄마·아빠·장모님·언니·형·동생을 챙기는 일은 부모가 아니라 가족이다.',
    '자녀 이름·담임·학원·자녀 숙제가 나오는 일은 내가 학생인 게 아니라 부모로서 하는 일이다. "학생"은 본인이 학교에서 수강·과제·학교 시험을 하는 흔적이 있을 때만 쓴다. 자격증·기사·공무원 시험 준비는 수험생.',
    '예) 자녀 담임 상담·자녀 숙제·하원 조율 → 부모. 수업·강의·학생 지도·논문·연구 → 교수(교수 흔적이 없으면 연구자). 과제·수강·학교 시험 → 학생. 알바 근무·교대 → 알바생. 학과평가·시간표·학과회의 안건·조교 업무 → 학과장. 팀원 1:1·팀원 평가·업무 배분 → 팀장. 운동(필라테스·러닝·헬스, 주 n회 포함)·병원·취미 → 나 자신. 봉사 → 봉사자. 모임 공지·모임 책 고르기 → 모임장.',
    '일하는 자리는 직업이 보이면 그 이름을 쓴다(기획자, 디자이너, 품질관리, 개발자). 고객·견적·납품이 보이면 프리랜서 또는 그 직업. 직업 단서가 없을 때만 직장인.',
    '회의·스탠드업·리뷰가 많다고 팀장이 아니다. 팀장은 팀원을 맡은 흔적(팀원 1:1, 팀원 평가, 업무 배분)이 있을 때만.',
    '역할 이름은 내가 서는 자리다. 장소·기관·다른 사람·관계 단어(도서관, 회사, 형제, 부모님, 엄마)는 역할 이름이 될 수 없다.',
    '책임이 다른 역할은 합치지 않는다(교수와 학과장, 직원과 팀장).',
    '[대괄호] 안의 말은 프로젝트 표시일 뿐 역할 이름이 아니다. 단 "[일정]"으로 시작하는 줄은 캘린더 일정이다. 할 일과 같은 기준으로 역할에 넣는다(수업·강의 → 교수, 학원 픽업 → 부모, 헬스 → 나 자신).',
    '관계는 글에 보이는 만큼만: 배우자로 보이는 사람과의 일 → 배우자, 내 부모님·형제·집안일 → 가족, 이름만 나오는 또래·지인 → 친구. 이름만 보고 가족이라 단정하지 않는다.',
    '성별을 짐작하지 않는다. 아빠·엄마·남편·아내·딸·아들은 글에 그 단서가 분명할 때만 쓰고, 아니면 부모·배우자·가족을 쓴다.',
    '글에 보이지 않는 직책을 지어내지 않는다(동아리 일 → 동아리 회장은 "회장"이 보일 때만, 아니면 동아리).',
    '역할은 2~6개, 이름은 2~6자 한국어 명사. 기존 역할이 주어지면 뜻이 맞는 할 일은 그 이름을 그대로 쓴다.',
    '"사람" 목록이 주어지면 그 관계를 그대로 믿는다(예: 준서=아들이면 준서 관련 일은 부모, 지영=아내면 배우자). 관계로 이 사람의 성별이 드러나면 아빠·엄마·남편·아내를 써도 된다(아내가 있으면 남편, 아들 일은 아빠).',
    '모든 id를 빠짐없이 정확히 한 번씩, 가장 주된 역할 하나에만 넣는다. [일정] 줄도 빠뜨리지 않는다.',
    '할 일에 나오는 사람(이름 2~4자, 별명, "최 대리"·"정 대표"·"박 선생님"처럼 호칭이 붙은 사람)을 최대 5개 골라 people에 넣고, 글로 보아 가장 그럴듯한 관계를 guess에 짧게 적는다(아들, 딸, 배우자, 연인, 부모님, 형제, 동료, 팀원, 고객, 학생, 선생님, 회원, 친구, 모름). 엄마·언니처럼 관계 단어만 있는 것은 넣지 않는다. "사람" 목록에 이미 있는 이름은 넣지 않는다. 역할명·회사명·과목명·가게 이름은 사람이 아니다.',
    '설명 없이 JSON 하나만 출력한다: {"groups":[{"name":"역할","ids":["id",...]}],"people":[{"name":"이름","guess":"관계"}]}'
  ].join('\n');
  const example = [
    { role: 'user', content: '기존 역할: 없음\n할 일:\n- id=a1: [신규몰] 견적서 다시\n- id=a2: 거래처 미팅 자료\n- id=a3: 둘째 소아과 예약\n- id=a4: 아버지 칠순 식당 알아보기\n- id=a5: 수영 등록\n- id=a6: 분리수거' },
    { role: 'assistant', content: '{"groups":[{"name":"직장인","ids":["a1","a2"]},{"name":"부모","ids":["a3"]},{"name":"가족","ids":["a4","a6"]},{"name":"나 자신","ids":["a5"]}],"people":[]}' },
    { role: 'user', content: '기존 역할: 없음\n할 일:\n- id=b1: [영상편집] 기말 과제 렌더링\n- id=b2: 편의점 토요일 대타 되는지\n- id=b3: 아빠 생일 케이크 예약\n- id=b4: [밴드부] 공연 포스터 인쇄\n- id=b5: 수강신청 장바구니\n- id=b6: 준호한테 책 돌려주기' },
    { role: 'assistant', content: '{"groups":[{"name":"학생","ids":["b1","b5"]},{"name":"알바생","ids":["b2"]},{"name":"가족","ids":["b3"]},{"name":"동아리","ids":["b4"]},{"name":"친구","ids":["b6"]}],"people":[{"name":"준호","guess":"친구"}]}' },
    { role: 'user', content: '기존 역할: 없음\n할 일:\n- id=c1: 서윤 담임 김지은 선생님께 상담 답장\n- id=c2: 박 과장에게 출하 검사표 보내기\n- id=c3: 전기기사 기출 2회분 풀기\n- id=c4: 언니랑 엄마 생신 선물 정하기\n- id=c5: 요가 주 3회\n- id=c6: [일정] 주간 회의\n- id=c7: [일정] 서윤 피아노 픽업' },
    { role: 'assistant', content: '{"groups":[{"name":"품질관리","ids":["c2","c6"]},{"name":"부모","ids":["c1","c7"]},{"name":"수험생","ids":["c3"]},{"name":"가족","ids":["c4"]},{"name":"나 자신","ids":["c5"]}],"people":[{"name":"서윤","guess":"딸"},{"name":"김지은","guess":"선생님"},{"name":"박 과장","guess":"동료"}]}' }
  ];
  const user = '기존 역할: ' + (roles.join(', ') || '없음') + '\n사람: ' + (people.map(([n, r]) => n + '=' + r).join(', ') || '없음') + '\n할 일:\n' + items.map(x => `- id=${x.id}: ${x.title}`).join('\n');
  const msgs = [{ role: 'system', content: sys }, ...example, { role: 'user', content: user }];
  let raw = '', out;
  try {
    raw = await llm(env, msgs, 700); out = jsonIn(raw);
    if (!out || !Array.isArray(out.groups)) { raw = await llm(env, msgs.concat([{ role: 'assistant', content: String(raw).slice(0, 400) }, { role: 'user', content: 'JSON 형식이 아니다. {"groups":[...]} 하나만 다시 출력해.' }]), 700); out = jsonIn(raw); }
  } catch (e) { return json({ error: 'model failed', reason: String(e.message || e) }, 502); }
  await env.PLANNER.put(dk, String(used + 1), { expirationTtl: 172800 });
  const known = new Set(items.map(x => x.id)), seen = new Set();
  const groups = ((out && out.groups) || []).map(g => ({ name: String(g.name || '').replace(/[\[\]"'`]/g, '').trim().slice(0, 8), ids: (g.ids || []).map(String).filter(id => known.has(id) && !seen.has(id) && seen.add(id)) })).filter(g => g.name && g.ids.length);
  // 사람 사전으로 내 자리가 드러나면 이름을 사람 말로: 배우자=아내 → 남편, 아이 일 → 준서 아빠
  if (!roles.length && people.length) {
    const rel = Object.fromEntries(people), vals = Object.values(rel);
    const me = vals.includes('아내') ? '남편' : vals.includes('남편') ? '아내' : '';
    const kid = Object.keys(rel).find(n => rel[n] === '아들' || rel[n] === '딸');
    const pw = me === '남편' ? '아빠' : me === '아내' ? '엄마' : '';
    groups.forEach(g => {
      if (g.name === '부모' && pw) g.name = kid ? kid + ' ' + pw : pw;
      else if (g.name === '배우자' && me) g.name = me;
    });
  }
  const fixName = { '형제': '가족', '자매': '가족', '부모님': '가족', '엄마': '가족', '아빠': '가족', '자녀': '부모', '도서관': '봉사자', '회사': '직장인' };
  groups.forEach(g => { if (fixName[g.name]) g.name = fixName[g.name]; if (g.name === '연인' || g.name === '애인') g.name = '연인'; });
  for (let i = groups.length - 1; i > 0; i--) { const j = groups.findIndex(x => x.name === groups[i].name); if (j < i) { groups[j].ids.push(...groups[i].ids); groups.splice(i, 1); } }
  const known2 = new Set(people.map(([n]) => n));
  const ppl = ((out && out.people) || []).map(x => ({ name: String(x.name || '').replace(/[^가-힣A-Za-z0-9 ]/g, '').trim().slice(0, 8), guess: String(x.guess || '모름').slice(0, 6) })).filter(x => x.name.length >= 2 && !known2.has(x.name) && items.some(it => it.title.includes(x.name))).slice(0, 5);
  // 모델이 사람을 못 뽑았을 때: 호칭·조사 앞의 이름을 글에서 직접 찾는다
  if (!ppl.length) {
    const stop = new Set(['다음', '이번', '지난', '학과', '팀원', '고객', '회사', '학생', '수업', '강의', '주말', '오늘', '내일', '부모님', '선생님', '친구', '동료', '가족', '엄마', '아빠', '언니', '누나', '오빠', '동생', '아내', '남편', '담임', '교수', '부모', '대리', '대표', '선생', '과장', '팀장']);
    const found = [];
    items.forEach(it => {
      const t = it.title.replace(/^\[일정\]\s*/, '');
      for (const m of t.matchAll(/(?:^|\s)([가-힣]{1,3})\s?(교수|선생님|대리|대표|과장|팀장|부장)/g)) found.push([m[1] + ' ' + m[2], m[2] === '선생님' ? '선생님' : m[2] === '대표' ? '고객' : '동료']);
      for (const m of t.matchAll(/(?:^|\s)([가-힣]{2,3})(에게|께|한테|이랑|랑|하고|와|과)(?=\s|$)/g)) { let n = m[1]; if (n.length === 3 && n.endsWith('이') && /랑|와/.test(m[2])) n = n.slice(0, 2); found.push([n, '모름']); }
      for (const m of t.matchAll(/(?:^|\s)([가-힣]{2,3})\s담임/g)) found.push([m[1], '아들']);
    });
    const seen2 = new Set();
    found.filter(([n]) => !stop.has(n) && !known2.has(n) && !roles.includes(n) && !groups.some(g => g.name === n) && !seen2.has(n) && seen2.add(n)).slice(0, 5).forEach(([n, g]) => ppl.push({ name: n, guess: g === '아들' ? '모름' : g }));
  }
  return json(Object.assign({ groups, people: ppl, model: env.LLM_URL ? 'sllm' : 'workers-ai' }, body.debug ? { raw: String(raw).slice(0, 1500) } : {}));
}

// ── 주간 리뷰: 앱이 보낸 한 주의 사실로 3~4문장 리뷰와 다음 주 B 후보를 쓴다 ──
async function review(req, env, token) {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (!(await env.PLANNER.get('u:' + token))) return json({ error: 'unknown planner' }, 404);
  const dk = 'r:' + token + ':' + new Date().toISOString().slice(0, 10), used = Number(await env.PLANNER.get(dk) || 0);
  if (used >= 5) return json({ error: 'daily limit' }, 429);
  let b; try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const cut = (a, n, f) => (Array.isArray(a) ? a : []).slice(0, n).map(f);
  const done = cut(b.done, 30, x => `- ${String(x.title).slice(0, 60)}${x.role ? ' (' + String(x.role).slice(0, 8) + ')' : ''}`);
  const open = cut(b.open, 25, x => `- ${String(x.title).slice(0, 60)}${x.role ? ' (' + String(x.role).slice(0, 8) + ')' : ''}${x.due ? ' 마감 ' + String(x.due).slice(0, 10) : ''}${x.wait ? ' 남의 답 기다리는 중' : ''}`);
  const hours = Object.entries(b.hours || {}).slice(0, 10).map(([k, v]) => `${String(k).slice(0, 8)} ${Number(v) || 0}시간`).join(', ');
  const notes = cut(b.notes, 7, x => '- ' + String(x).slice(0, 80));
  const sys = [
    '너는 종이 플래너를 같이 쓰는 비서다. 한 주의 사실만 보고 일요일 리뷰를 쓴다.',
    '3~4문장, 존댓말, 담백하게. 칭찬·격려·감탄·이모지 금지. 완료 개수로 사람을 평가하지 않는다.',
    '1) 이번 주 실제로 끝낸 일에서 눈에 띄는 것 하나 2) 캘린더 시간이 어느 역할에 몰렸는지(시간 자료가 있을 때만, "캘린더 일정 기준"이라고 밝힌다) 3) 남은 일 중 다음 주에 먼저 볼 것 하나와 그 이유(마감·오래 멈춤). 남의 답을 기다리는 일은 미룬 일로 보지 않는다.',
    '자료에 없는 사실을 지어내지 않는다. 일정이 없는 시간을 쉬었다고 단정하지 않는다.',
    '다음 주 후보는 남은 일이나 끝낸 일의 다음 단계에서 최대 3개, 각각 바로 시작할 수 있는 크기의 행동으로 쓰고, 역할은 주어진 역할 이름 중 하나, due는 다음 주 안의 날짜(YYYY-MM-DD).',
    '설명 없이 JSON 하나만: {"summary":"...","cands":[{"title":"...","role":"...","due":"YYYY-MM-DD"}]}'
  ].join('\n');
  const user = `오늘: ${String(b.today || '').slice(0, 10)} / 다음 주 시작: ${String(b.next || '').slice(0, 10)}\n역할: ${cut(b.roles, 8, String).join(', ') || '없음'}\n이번 주 끝낸 일:\n${done.join('\n') || '- 없음'}\n남은 일:\n${open.join('\n') || '- 없음'}\n캘린더 시간: ${hours || '없음'}\n한 줄 일기:\n${notes.join('\n') || '- 없음'}`;
  let out;
  try { out = jsonIn(await llm(env, [{ role: 'system', content: sys }, { role: 'user', content: user }], 600)); } catch (e) { return json({ error: 'model failed' }, 502); }
  if (!out || !out.summary) return json({ error: 'no summary' }, 502);
  await env.PLANNER.put(dk, String(used + 1), { expirationTtl: 172800 });
  const roles = new Set(cut(b.roles, 8, String));
  const cands = cut(out.cands, 3, c => ({ title: String(c.title || '').slice(0, 60), role: roles.has(String(c.role)) ? String(c.role) : '', due: /^\d{4}-\d{2}-\d{2}$/.test(String(c.due)) ? String(c.due) : '' })).filter(c => c.title);
  return json({ summary: String(out.summary).slice(0, 600), cands });
}

// ── 일정: 사용자가 준 iCal 주소(구글 캘린더 '비공개 주소' 등)를 받아 기간 안의 일정을 한국 시간으로 펼친다 ──
const DAY = 86400000;
function icsLines(text) { return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/); }
function icsProp(line) { const i = line.indexOf(':'); if (i < 0) return null; const head = line.slice(0, i), val = line.slice(i + 1); const [name, ...ps] = head.split(';'); const params = {}; ps.forEach(p => { const [k, v] = p.split('='); params[k.toUpperCase()] = (v || '').replace(/"/g, ''); }); return { name: name.toUpperCase(), params, val }; }
// '한국 시간 기준 벽시계' 밀리초(Date.UTC로 만든 값)로 바꾼다
function icsTime(val, params) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(val).trim()); if (!m) return null;
  const allDay = !m[4] || params.VALUE === 'DATE';
  let t = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  if (m[7] === 'Z') t += KST;
  return { t, allDay };
}
function icsUnescape(v) { return String(v || '').replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim(); }
const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
function expand(ev, from, to) {
  const out = [], dur = ev.end ? ev.end - ev.start : (ev.allDay ? DAY : 3600000);
  const push = s => { if (s + Math.max(dur, 1) > from && s < to && !ev.ex.has(s)) out.push(s); };
  if (!ev.rrule) { push(ev.start); return out.map(s => [s, dur]); }
  const R = {}; ev.rrule.split(';').forEach(kv => { const [k, v] = kv.split('='); R[k] = v; });
  const freq = R.FREQ, step = Math.max(1, +(R.INTERVAL || 1)), count = R.COUNT ? +R.COUNT : Infinity;
  const until = R.UNTIL ? (icsTime(R.UNTIL, {}) || {}).t : Infinity;
  const byday = R.BYDAY ? R.BYDAY.split(',').map(x => WD[x.slice(-2)]).filter(x => x != null) : null;
  let n = 0, guard = 0;
  if (freq === 'WEEKLY') {
    const days = byday && byday.length ? byday : [new Date(ev.start).getUTCDay()];
    const base = ev.start - new Date(ev.start).getUTCDay() * DAY; // 그 주 일요일
    for (let w = 0; guard < 3000; w += step, guard++) {
      for (const d of days.slice().sort()) {
        const s = base + (w * 7 + d) * DAY; if (s < ev.start) continue;
        if (s > until || n >= count || s >= to) return out.map(x => [x, dur]);
        n++; push(s);
      }
    }
  } else {
    for (let s = ev.start; guard < 5000; guard++) {
      if (s > until || n >= count || s >= to) break;
      n++; push(s);
      const d = new Date(s);
      if (freq === 'DAILY') s += step * DAY;
      else if (freq === 'MONTHLY') s = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + step, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes());
      else if (freq === 'YEARLY') s = Date.UTC(d.getUTCFullYear() + step, d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes());
      else break;
    }
  }
  return out.map(x => [x, dur]);
}
function parseIcs(text, from, to) {
  const lines = icsLines(text), evs = [], overrides = new Map();
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = { ex: new Set() }; continue; }
    if (line === 'END:VEVENT') { if (cur && cur.start != null && cur.status !== 'CANCELLED') { if (cur.rid != null) overrides.set(cur.uid + '@' + cur.rid, cur); else evs.push(cur); } else if (cur && cur.rid != null) overrides.set(cur.uid + '@' + cur.rid, null); cur = null; continue; }
    if (!cur) continue;
    const p = icsProp(line); if (!p) continue;
    if (p.name === 'SUMMARY') cur.title = icsUnescape(p.val);
    else if (p.name === 'UID') cur.uid = p.val;
    else if (p.name === 'STATUS') cur.status = p.val.toUpperCase();
    else if (p.name === 'RRULE') cur.rrule = p.val;
    else if (p.name === 'DTSTART') { const t = icsTime(p.val, p.params); if (t) { cur.start = t.t; cur.allDay = t.allDay; } }
    else if (p.name === 'DTEND') { const t = icsTime(p.val, p.params); if (t) cur.end = t.t; }
    else if (p.name === 'EXDATE') p.val.split(',').forEach(v => { const t = icsTime(v, p.params); if (t) cur.ex.add(t.t); });
    else if (p.name === 'RECURRENCE-ID') { const t = icsTime(p.val, p.params); if (t) cur.rid = t.t; }
  }
  const out = [];
  const emit = (ev, s, dur) => {
    const ymd = t => new Date(t).toISOString().slice(0, 10), hm = t => new Date(t).toISOString().slice(11, 16);
    if (ev.allDay) { for (let d = s; d < s + Math.max(dur, DAY); d += DAY) if (d >= from && d < to) out.push({ date: ymd(d), start: '', end: '', title: ev.title || '(제목 없음)', allDay: true }); }
    else out.push({ date: ymd(s), start: hm(s), end: hm(s + dur), title: ev.title || '(제목 없음)', allDay: false });
  };
  for (const ev of evs) for (const [s, dur] of expand(ev, from, to)) {
    const key = (ev.uid || '') + '@' + s;
    if (overrides.has(key)) { const o = overrides.get(key); overrides.delete(key); if (o) emit(Object.assign({ allDay: ev.allDay }, o), o.start, (o.end || o.start + dur) - o.start); continue; }
    emit(ev, s, dur);
  }
  for (const o of overrides.values()) if (o && o.start >= from && o.start < to) emit(o, o.start, (o.end || o.start + 3600000) - o.start);
  return out.sort((a, b) => (a.date + (a.allDay ? '' : a.start)).localeCompare(b.date + (b.allDay ? '' : b.start))).slice(0, 400);
}
async function cal(req, env, token) {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (!(await env.PLANNER.get('u:' + token))) return json({ error: 'unknown planner' }, 404);
  let body; try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  let url = String(body.url || '').trim().replace(/^webcal:\/\//i, 'https://');
  if (!/^https:\/\/[^\s]+$/i.test(url)) return json({ error: 'https 주소가 필요해요' }, 400);
  const from = Date.parse((body.from || '') + 'T00:00:00Z') || (Date.now() + KST - 7 * DAY), to = Date.parse((body.to || '') + 'T00:00:00Z') || (from + 21 * DAY);
  let text; try { const r = await fetch(url, { cf: { cacheTtl: 600, cacheEverything: true }, headers: { 'user-agent': 'DUAL-Planner-Calendar' } }); if (!r.ok) return json({ error: '주소를 열 수 없어요', status: r.status }, 502); text = await r.text(); } catch (e) { return json({ error: '주소를 열 수 없어요' }, 502); }
  if (!/BEGIN:VCALENDAR/.test(text)) return json({ error: '캘린더(iCal) 주소가 아니에요' }, 400);
  return json({ events: parseIcs(text, from, Math.min(to, from + 62 * DAY)) });
}

// ── 하루 사진 한 장: 날짜별로 따로 저장(플래너 데이터와 분리), 600KB까지 JPEG ──
async function photo(req, env, token, ds) {
  const key = 'p:' + token + ':' + ds;
  if (req.method === 'GET') {
    const v = await env.PLANNER.get(key, { type: 'arrayBuffer' }); if (!v) return new Response('', { status: 404, headers: CORS });
    return new Response(v, { headers: Object.assign({ 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=604800' }, CORS) });
  }
  if (req.method === 'DELETE') { await env.PLANNER.delete(key); return json({ ok: true }); }
  if (req.method !== 'PUT') return json({ error: 'method' }, 405);
  const buf = await req.arrayBuffer(), b = new Uint8Array(buf);
  if (buf.byteLength > 600 * 1024) return json({ error: 'too big' }, 413);
  if (!(b[0] === 0xFF && b[1] === 0xD8)) return json({ error: 'jpeg only' }, 415);
  await env.PLANNER.put(key, buf); return json({ ok: true, size: buf.byteLength });
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    const pm = url.pathname.match(/^\/u\/([A-Za-z0-9_-]{16,64})\/photo\/(\d{4}-\d{2}-\d{2})\/?$/);
    if (pm) return photo(req, env, pm[1], pm[2]);
    const am = url.pathname.match(/^\/auth\/(config|google|apple|account)\/?$/);
    if (am) return auth(req, env, am[1]);
    if (url.pathname.replace(/\/$/, '') === '/admin/stats') return adminStats(req, env);
    const m = url.pathname.match(/^\/u\/([A-Za-z0-9_-]{16,64})\/(state|items|mcp|group|cal|feedback|review)\/?$/);
    if (!m) return json({ ok: true, name: 'dual-planner-api', usage: '/u/:token/state | /u/:token/items | /u/:token/mcp | /auth/config | /auth/google | /auth/apple | /auth/account' });
    const token = m[1], kind = m[2], key = 'u:' + token;
    if (kind === 'mcp') return mcp(req, env, token);
    if (kind === 'group') return group(req, env, token);
    if (kind === 'cal') return cal(req, env, token);
    if (kind === 'feedback') return feedback(req, env, token);
    if (kind === 'review') return review(req, env, token);
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
      cur.agent = { name: body.src || 'api', at: new Date().toISOString(), via: 'http' };
      await env.PLANNER.put(key, JSON.stringify(cur)); return json({ ok: true, ...r });
    }
    return json({ error: 'not found' }, 404);
  }
};
