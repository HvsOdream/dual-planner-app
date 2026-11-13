// 올리기 전에 한 번 도는 점검: 탭마다 열어 보고, 자주 쓰는 동작을 한 번씩 해 본다.
//   node tests/smoke.js            (저장소 루트에서)
// 앱은 index.html 한 장을 그대로 띄우고(서버 없이), 서버는 worker/src/index.js를 가짜 KV로 직접 부른다.
// 하나라도 틀리면 목록을 찍고 종료 코드 1.
const path = require('path'), fs = require('fs'), { pathToFileURL } = require('url');
const { chromium, devices } = require('playwright');
const ROOT = path.resolve(__dirname, '..'), PAGE = pathToFileURL(path.join(ROOT, 'index.html')).href;
const fails = [], passed = [];
const check = (name, ok, detail) => { (ok ? passed : fails).push(name + (ok || detail === undefined ? '' : ' → ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)))); };

const LONG = '[신진] 설명회 발표자료(103쪽) 확인: 신진 A·B 온라인 서면만, 배점 창의성·도전성 40(융합분야는 융합성 포함)/내용·방법 적합성 30(연구비·기간 적정성 포함)/연구자 우수성 20/활용·기대효과 10. 계획서 분량 제한 초과 시 불이익.';

// 브라우저 안에서 도는 씨앗 데이터(오늘 기준으로 날짜를 만든다)
function seed(LONG) {
  try {
    if (localStorage.getItem('dpa_v1')) return;
    const p = n => String(n).padStart(2, '0'), f = d => d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    const day = n => f(new Date(Date.now() + n * 864e5)), td = day(0), yd = day(-1), tm = day(1), old = day(-22);
    localStorage.setItem('dpa_dev', '1');
    const days = {};
    days[td] = { intent: '긴 의도 문장: ' + LONG.slice(0, 70), note: '', picks: ['a1', 'a2', 'a3'], inbox: [{ id: 'i_note', text: LONG, kind: 'note', src: 'mcp', at: '06:40' }, { id: 'i_todo', text: '발표자료 PDF 받기', kind: 'todo', src: 'mcp', at: '06:45' }] };
    days[yd] = { intent: '', note: '어제의 한 줄 일기. ' + LONG.slice(0, 80), picks: [], aOpen: 1, inbox: [{ id: 'i_old', text: LONG, kind: 'note', src: 'mcp', at: '17:15', moved: true, dropped: true }] };
    const R = (id, bucket, title, x) => Object.assign({ id, week: td, bucket, role: '연구자', title, done: false, carry: 0, checks: {} }, x || {});
    localStorage.setItem('dpa_v1', JSON.stringify({
      v: 1, roles: ['교수자', '연구자'], preview: 'paid',
      settings: { theme: 'leather', calUrl: 'x', notify: { on: false, morning: '00:00', evening: '00:00', sunday: '00:00', off: {} } },
      calCache: { url: 'x', at: Date.now(), events: [{ date: td, start: '09:00', end: '10:30', title: '게임기획의이해 수업' }, { date: td, allDay: true, title: '원서 접수' }, { date: tm, start: '10:00', end: '11:00', title: '산학협력단 미팅' }] },
      rocks: [
        R('a1', 'urgent', '중랑구 발표자료 제작 (11/18 발표)', { due: td }), R('a2', 'urgent', LONG, { due: yd }), R('a3', 'urgent', '끝낸 일', { done: true, doneAt: td, checks: { [td]: true } }),
        R('b1', 'important', '[신진] 연구계획서 초안 완성', { due: day(2) }), R('c1', 'light', '출판사 통화', { at: td + 'T' + p(new Date().getHours()) + ':' + p(new Date().getMinutes()), due: td, appt: true, role: '' }),
        R('d1', 'nice', 'HvsO 전역지도 스케치 다시 보기', { week: old, parkedAt: old, role: '' }), R('y1', 'light', LONG, { done: true, doneAt: yd, checks: { [yd]: true } })
      ],
      days, reviews: {}, seen: {}, vols: [], memos: [{ id: 'm_1', text: '연구실 5090 PC에 Qwen 올려 보기\n둘째 줄', at: new Date().toISOString(), u: '' }]
    }));
  } catch (e) {}
}

async function ui(browser, label, ctxOpts) {
  const ctx = await browser.newContext(Object.assign({ timezoneId: 'Asia/Seoul' }, ctxOpts)), pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  // 점검은 바깥으로 아무것도 보내지 않는다(실제 서버에 시험 데이터가 쌓이면 안 된다)
  await ctx.route('**/*', r => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
  await pg.addInitScript(seed, LONG);
  await pg.goto(PAGE); await pg.waitForTimeout(1200);
  const ev = (fn, arg) => pg.evaluate(fn, arg);
  const C = (name, ok, detail) => check(`[${label}] ${name}`, ok, detail);
  await ev(() => { document.querySelectorAll('.intro,.login').forEach(e => e.remove()); go('today'); });
  // 글이 칸 밖으로 넘쳐 아래와 겹치는지(달력 날짜 상세에서 났던 사고)
  const overflow = () => ev(() => [...document.querySelectorAll('.page.on .line, .page.on .lbl, .page.on .mrow, .page.on .ev, .page.on .nrow, .page.on .item')].filter(e => e.offsetParent && getComputedStyle(e).overflowY === 'visible' && e.scrollHeight - e.clientHeight > 3).map(e => (e.className || e.tagName) + ': ' + e.textContent.trim().slice(0, 24)));

  C('버전 표시가 VERSION 파일과 같다', (await ev(() => APP_VER)) === fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim(), await ev(() => APP_VER));

  // 1. 탭마다 열린다, 겹치는 줄이 없다
  for (const t of ['today', 'week', 'memo', 'review', 'more', 'notis', 'sub', 'priv']) {
    await ev(t => { if (t === 'more') moreSec = ''; go(t); }, t); await pg.waitForTimeout(120);
    const len = await ev(t => (document.querySelector('#p-' + t + ' .sheet') || { textContent: '' }).textContent.trim().length, t);
    C(`${t} 탭이 열린다`, len > 10, len);
    const o = await overflow(); C(`${t} 탭에 넘치는 줄이 없다`, !o.length, o.slice(0, 4));
  }
  for (const d of [-1, 1]) { await ev(d => { go('review'); selDay(addDays(today(), d)); }, d); const o = await overflow(); C(`달력 ${d < 0 ? '어제' : '내일'} 상세에 넘치는 줄이 없다`, !o.length, o.slice(0, 4)); }

  // 2. 오늘: 저녁 포스트잇, 제목 펼치기, 내일로, 일기로 닫기
  await ev(() => go('today'));
  C('오늘 닫기 포스트잇이 붙는다(알림 꺼짐)', await ev(() => !!document.getElementById('eveNote')));
  C('약속 포스트잇이 붙는다', await ev(() => [...document.querySelectorAll('#today .sticky .who')].some(e => /약속/.test(e.textContent))));
  C('오늘 화면에 내일 일정이 없다', await ev(() => !document.querySelector('#today .ev.tmr') && ![...document.querySelectorAll('#today .ev')].some(e => /산학협력단/.test(e.textContent))));
  C('일정 줄에 시작–끝이 붙어 나온다', await ev(() => [...document.querySelectorAll('#today .ev .tm')].some(e => /09:00–10:30/.test(e.textContent))));
  await pg.locator('#today .sticky .bn').first().click(); C('포스트잇 제목을 누르면 펼쳐진다', await ev(() => !!document.querySelector('#today .sticky .bn.open')));
  await ev(() => { toTomorrow('a1'); finishRock('a2'); });
  C('내일로: 내일 칸으로 옮겨 적는다', await ev(() => (D.days[addDays(today(), 1)].picks || []).includes('a1') && !D.days[today()].picks.includes('a1')));
  await ev(() => eveNote('점검용 한 줄')); C('남은 일 없고 일기를 적으면 오늘 닫기가 떨어진다', await ev(() => !document.getElementById('eveNote') && dayOf(today()).note === '점검용 한 줄'));

  // 2-1. 알림을 누르고 들어오면 그 포스트잇이 맨 위에, 알림 문장 그대로
  await ev(() => { const ds = today(); dropNote('brief:' + ds); D.nlog = (D.nlog || []).filter(x => x.k !== 'brief:' + ds); D._sched = [{ k: 'brief:' + ds, label: '오늘 브리핑', text: '오늘 브리핑 · 점검용 알림 문장', tab: 'today', at: Date.now() - 60000 }]; go('week'); onNotifTap(2000); });
  const top = await ev(() => { const s = document.querySelector('#today .sticky'); return s ? { who: s.querySelector('.who').textContent, flash: s.classList.contains('flash'), first: (s.querySelector('.bev') || { textContent: '' }).textContent } : null; });
  C('아침 알림을 누르면 오늘 브리핑이 맨 위에 강조돼 붙는다(뗀 것도)', (await ev(() => tab === 'today' || spread())) && !!top && /오늘 브리핑/.test(top.who) && top.flash, top);
  C('포스트잇 첫 줄이 알림으로 나간 문장이다', !!top && top.first === '점검용 알림 문장', top);
  await ev(() => { nTap = null; dropNote('brief:' + today()); });
  await ev(() => { isNative = () => true; const ds = today(); D.nLast = ''; dayOf(ds).note = ''; D.noteOff['eve:' + ds] = ds; D._sched = [{ k: 'eve:' + ds, label: '오늘 닫기', text: '오늘 닫기 · 놓친 알림', tab: 'today', at: Date.now() - 120000 }]; D.nlog = (D.nlog || []).filter(x => x.via !== 'n' && x.k !== 'eve:' + ds); go('memo'); notifCatchUp(); isNative = () => false; });
  C('알림 뒤 10분 안에 열면 그 알림에서 온 것으로 본다', await ev(() => !!nTap && nTap.k === 'evening' && !!document.getElementById('eveNote')), await ev(() => ({ nTap, last: D.nLast, log: (D.nlog || []).filter(x => /^eve/.test(x.k)), sched: D._sched, tab, eve: !!document.getElementById('eveNote') })));
  await ev(() => { nTap = null; });
  // 3. 하면 좋은 일
  C('하면 좋은 일 포스트잇이 붙는다(어제 A 1개)', await ev(() => [...document.querySelectorAll('#today .sticky')].some(e => /하면 좋은 일/.test(e.textContent) && /HvsO/.test(e.textContent))));
  await ev(() => niceToday('d1')); C('오늘로: 오늘 칸에 올리고 포스트잇은 떨어진다', await ev(() => D.days[today()].picks.includes('d1') && ![...document.querySelectorAll('#today .sticky')].some(e => /하면 좋은 일/.test(e.textContent))));

  // 4. 할 일: 제목 눌러 고치기, 칸 옮기기
  await ev(() => go('week'));
  await pg.locator('#week .item .tx[data-ed]', { hasText: '중랑구' }).first().click();
  C('할 일 제목을 누르면 고치는 줄이 펼쳐진다', await ev(() => !!document.querySelector('#week .rowed')));
  await pg.locator('#week .item .bslot button', { hasText: /^D$/ }).first().click();
  C('칸 옮기기 A→D', await ev(() => rock('a1').bucket === 'nice'));
  await ev(() => { rowBucket('a1', 'important'); rowTitle('a1', '고친 제목'); });
  C('B로 옮기면 마감이 잡힌다 · 제목 고침', await ev(() => { const r = rock('a1'); return r.bucket === 'important' && !!r.due && r.title === '고친 제목'; }));
  await ev(() => rowDue('a1', '')); C('B는 마감을 비울 수 없다', await ev(() => !!rock('a1').due));
  // 날짜 고르기: 취소하면 그대로, 누르면 바뀐다
  const due0 = await ev(() => rock('a1').due);
  await pg.locator('#week .item .bslot .dbtn').first().click(); C('날짜 고르기가 열린다', await ev(() => !!document.querySelector('#dpick .dpbox')));
  await pg.locator('#dpick .dpf .go').click(); C('취소하면 날짜가 그대로다', await ev(d => !document.getElementById('dpick') && rock('a1').due === d, due0));
  await pg.locator('#week .item .bslot .dbtn').first().click(); await pg.locator('#dpick .dpq button', { hasText: '내일' }).click();
  C('고르면 바로 바뀐다', await ev(() => rock('a1').due === addDays(today(), 1)));
  await ev(() => openAdd('urgent')); await pg.waitForTimeout(400);
  C('글 칸에 들어가면 아래 탭이 치워진다', await ev(() => document.body.classList.contains('kb') && (!document.querySelector('.tabbar') || getComputedStyle(document.querySelector('.tabbar')).display === 'none')));
  await pg.locator('#addrock .dbtn').click(); await pg.locator('#dpick .dpf .go').click(); C('새 할 일: 마감을 눌렀다 취소해도 날짜가 안 잡힌다', await ev(() => document.getElementById('rockDue').value === ''));
  await ev(() => { addOpen = false; renderWeek(); document.body.classList.remove('kb'); });

  // 5. 메모: 적기, 고치기, 할 일로, 지우기, 비서 메모는 메모로 누른 것만
  await ev(() => go('memo'));
  const n0 = await ev(() => memoEntries().length);
  await pg.fill('#memoIn', '점검 메모\n둘째 줄'); await pg.locator('#memoGo').click();
  C('메모 적기', await ev(() => memoEntries().length) === n0 + 1);
  C('비서 메모는 자동으로 들어오지 않는다', await ev(() => !memoEntries().some(e => e.note)));
  await ev(() => noteToMemo('i_note')); C('메모로: 누른 비서 메모만 들어온다', await ev(() => memoEntries().filter(e => e.note).length === 1));
  await ev(() => { const m = liveMemos()[0]; memoToRock(m.id, 'light'); }); C('메모를 할 일로(여러 줄은 남는다)', await ev(() => D.rocks.some(r => r.title === '점검 메모' && r.bucket === 'light') && liveMemos().some(m => m.toRock)));
  await ev(() => delMemo('i_note')); C('메모 탭에서 지우면 빠진다', await ev(() => !memoEntries().some(e => e.note)));

  // 6. 달력: 내일 일정, 약속 적기(끝 시각)
  await ev(() => { go('review'); selDay(addDays(today(), 1)); });
  C('달력에서 내일 일정이 보인다', await ev(() => [...document.querySelectorAll('#review .ev')].some(e => /산학협력단/.test(e.textContent))));
  await pg.locator('#review .lbl button', { hasText: '+ 약속' }).click();
  await pg.fill('#evTc', '13:00'); await pg.fill('#evEc', '14:00'); await pg.fill('#evNc', '점검 약속'); await pg.locator('#review .evadd button').click();
  C('달력에서 약속 적기(플래너에만, 끝 시각 포함)', await ev(() => { const r = D.rocks.find(x => x.title === '점검 약속'); return !!r && r.appt && r.at === addDays(today(), 1) + 'T13:00' && r.atEnd === '14:00'; }));
  C('적은 약속이 시작–끝으로 보인다', await ev(() => [...document.querySelectorAll('#review .ev .tm')].some(e => /13:00–14:00/.test(e.textContent))));

  // 7. 메뉴: 첫 화면 줄, 쪽마다 들어갔다 나오기
  await ev(() => { moreSec = ''; go('more'); });
  C('메뉴 첫 화면에 줄이 있다', (await ev(() => document.querySelectorAll('#moreIdx .mrow').length)) >= 8);
  for (const k of ['feats', 'roles', 'cal', 'cover', 'conn']) {
    await ev(k => openSec(k), k);
    const r = await ev(() => ({ vis: [...document.querySelectorAll('#moreSecs .msec')].filter(e => e.style.display !== 'none').map(e => e.dataset.sec), len: (document.querySelector('#moreSecs .msec:not([style*="none"])') || { textContent: '' }).textContent.trim().length, idx: document.getElementById('moreIdx').style.display }));
    C(`메뉴 › ${k} 쪽만 보인다`, r.vis.length === 1 && r.vis[0] === k && r.len > 3 && r.idx === 'none', r);
  }
  await pg.locator('#cover button[aria-label="메뉴로"]').click(); C('‹로 메뉴 첫 화면에 돌아온다', await ev(() => moreSec === '' && document.getElementById('moreIdx').style.display !== 'none'));
  await ev(() => { isNative = () => true; scheduleNotifs = async () => {}; openSec('notify'); });
  C('메뉴 › 알림 쪽(앱 흉내)', (await ev(() => document.querySelectorAll('#notifyBox .mrow').length)) >= 5);
  await ev(() => { isNative = () => false; moreSec = ''; });

  // 8. 지난 알림
  await ev(() => go('today'));
  C('종 아이콘: 접은 화면은 오늘에만, 펼친 화면은 오른쪽 쪽에', await ev(() => { const h = [...document.querySelectorAll('#cover .half')]; return h.length ? !h[0].querySelector('.bell') && !!h[1].querySelector('.bell') : !!document.querySelector('#cover .bell'); }));
  await pg.locator('#cover .bell').click();
  const rows = await ev(() => [...document.querySelectorAll('#notis .nrow')].map(e => e.textContent));
  C('지난 알림에 포스트잇과 비서 메모가 모인다', rows.some(x => /오늘 닫기/.test(x)) && rows.some(x => /비서 메모/.test(x)), rows.length);
  await pg.locator('#cover button[aria-label="뒤로"]').click(); C('지난 알림에서 뒤로', await ev(() => (spread() ? rightTab : tab) !== 'notis'));

  // 9. 동기화 병합, 구독 안 한 화면
  C('병합: 서버 메모와 내 메모가 다 남는다', await ev(() => { const m = mergeState(pickState(), { memos: [{ id: 'm_srv', text: '서버', at: '2026-01-01T00:00:00Z', u: '2026-01-01T00:00:00Z' }] }).memos; return m.some(x => x.id === 'm_srv') && m.some(x => x.id === 'm_1'); }));
  await ev(() => { D.preview = 'free'; });
  for (const t of ['today', 'week', 'memo', 'review', 'more']) await ev(t => go(t), t);
  C('구독 안 한 화면에서도 탭이 열린다', (await ev(() => document.querySelector('#p-more .sheet').textContent.length)) > 10);

  C('화면 오류가 없다', !errs.length, errs.slice(0, 3));
  await ctx.close();
}

async function server() {
  const C = (name, ok, detail) => check(`[서버] ${name}`, ok, detail);
  const w = (await import(pathToFileURL(path.join(ROOT, 'worker/src/index.js')).href)).default;
  const kv = new Map(), env = { PLANNER: { get: async k => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, String(v)); }, delete: async k => { kv.delete(k); }, list: async () => ({ keys: [] }) } };
  const T = 'smoketoken_0123456789', call = async (kind, method, body) => { const r = await w.fetch(new Request(`https://x/u/${T}/${kind}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env); return r.json(); };
  await call('state', 'PUT', { rocks: [{ id: 'r1', title: '할 일', bucket: 'urgent', u: '2026-11-01T00:00:00Z' }], memos: [{ id: 'm1', text: '옛', at: '2026-11-01T00:00:00Z', u: '2026-11-01T00:00:00Z' }], _modified: '2026-11-01T00:00:00Z' });
  let S = await call('state', 'PUT', { memos: [{ id: 'm1', text: '새', at: '2026-11-01T00:00:00Z', u: '2026-11-02T00:00:00Z' }, { id: 'm2', text: '둘', at: '2026-11-02T00:00:00Z', u: '2026-11-02T00:00:00Z' }] });
  C('메모 병합: 새 것이 이기고 둘 다 남는다', S.memos.length === 2 && S.memos.find(m => m.id === 'm1').text === '새' && S.rocks.length === 1, S.memos);
  await call('items', 'POST', { src: 'mcp', items: [{ text: '비서가 적은 메모', kind: 'memo' }, { text: '그날 메모', kind: 'note' }, { text: '통화', kind: 'item', bucket: 'C', at: '2030-01-02T10:00', end: '11:00' }] });
  S = await call('state', 'GET');
  const ap = S.rocks.find(r => r.title === '통화');
  C('비서가 메모장에 적는다(kind=memo)', S.memos.some(m => m.text === '비서가 적은 메모' && m.by));
  C('그날 메모는 그날 포스트잇으로(kind=note)', Object.values(S.days).some(d => (d.inbox || []).some(x => x.text === '그날 메모' && x.kind === 'note')));
  C('약속 끝 시각(end)', !!ap && ap.at === '2030-01-02T10:00' && ap.atEnd === '11:00', ap);
  await call('items', 'POST', { items: [{ id: ap.id, op: 'update', at: '' }] }); S = await call('state', 'GET');
  C('약속 시각을 빼면 끝 시각도 빠진다', !S.rocks.find(r => r.id === ap.id).at && !S.rocks.find(r => r.id === ap.id).atEnd);
  const mcp = async (method, params) => (await (await w.fetch(new Request(`https://x/u/${T}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }), env)).text());
  const tl = await mcp('tools/list', {});
  C('비서 도구 설명에 memo와 end가 있다', /memo/.test(tl) && /end/.test(tl));
  const rd = await mcp('tools/call', { name: 'planner_read', arguments: {} });
  C('planner_read에 메모장이 나온다', /메모장/.test(rd), rd.slice(0, 80));
}

(async () => {
  const browser = await chromium.launch();
  try {
    await ui(browser, '접은 화면', devices['iPhone 14']);
    await ui(browser, '펼친 화면', { viewport: { width: 1100, height: 800 } });
    await server();
  } catch (e) { fails.push('점검이 중간에 멈춤 → ' + (e && e.message || e).toString().split('\n')[0]); }
  await browser.close();
  console.log(`통과 ${passed.length} · 실패 ${fails.length}`); fails.forEach(f => console.log('  ✗ ' + f));
  process.exit(fails.length ? 1 : 0);
})();
