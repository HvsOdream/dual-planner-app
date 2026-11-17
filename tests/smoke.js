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
  await ev(() => { document.querySelectorAll('.intro,.login').forEach(e => e.remove()); _moreNotes = true; _retro = true; go('today'); }); // 접어 둔 포스트잇과 오늘의 회고는 펼쳐 놓고 점검한다
  // 실패했을 때 원인을 보려고, 화면을 다시 그린 최근 호출을 적어 둔다
  await ev(() => { window.__r = []; for (const nm of ['render', 'renderReview', 'renderWeek']) { const r0 = window[nm]; window[nm] = function () { window.__r.push(Math.round(performance.now()) + ' ' + nm + ' ← ' + new Error().stack.split('\n').slice(2, 4).map(x => x.trim().replace(/\(?file:\S+index\.html/, '(')).join(' ← ')); if (window.__r.length > 8) window.__r.shift(); return r0.apply(this, arguments); }; } });
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
  const pop = await ev(() => { const s = document.querySelector('#npop .sticky'); return s ? { who: s.querySelector('.who').textContent, first: (s.querySelector('.bev') || { textContent: '' }).textContent, dup: [...document.querySelectorAll('#today .sticky .who')].some(e => /오늘 브리핑/.test(e.textContent)) } : null; });
  C('아침 알림을 누르면 오늘 브리핑이 팝업으로 뜬다(뗀 것도)', !!pop && /오늘 브리핑/.test(pop.who) && !pop.dup, pop);
  C('팝업 첫 줄이 알림으로 나간 문장이다', !!pop && pop.first === '점검용 알림 문장', pop);
  await pg.locator('#npop .npf button').click();
  const top = await ev(() => { const s = document.querySelector('#today .sticky'); return s ? { who: s.querySelector('.who').textContent, flash: s.classList.contains('flash'), pop: !!document.getElementById('npop') } : null; });
  C('붙여 두기: 팝업이 닫히고 오늘 맨 위에 강조돼 붙는다', !!top && /오늘 브리핑/.test(top.who) && top.flash && !top.pop, top);
  await ev(() => { nTap = null; onNotifTap(2000); }); await pg.locator('#npop .sticky .act button', { hasText: '떼기' }).click();
  C('팝업에서 떼기: 닫히고 떼어진다', await ev(() => !document.getElementById('npop') && !!noteOff('brief:' + today())));
  await ev(() => { nTap = null; dayOf(today()).note = ''; D.rocks.push({ id: 'ev1', week: today(), bucket: 'urgent', role: '', title: '저녁 점검용', done: false, carry: 0, checks: {} }); dayOf(today()).picks.push('ev1'); onNotifTap(2001); });
  C('저녁 알림: 오늘 닫기가 팝업으로 뜬다', await ev(() => !!document.querySelector('#npop #eveNote') && document.querySelectorAll('#eveNote').length === 1));
  await pg.locator('#npop .bb button', { hasText: '내일로' }).first().click(); await pg.fill('#npop #eveNote', '팝업에서 쓴 일기'); await ev(() => document.querySelector('#npop #eveNote').blur()); await pg.waitForTimeout(150);
  C('팝업 안에서 내일로·일기까지 하면 팝업이 닫힌다', await ev(() => !document.getElementById('npop') && dayOf(today()).note === '팝업에서 쓴 일기' && dayOf(addDays(today(), 1)).picks.includes('ev1')));
  await ev(() => { nTap = null; dropNote('brief:' + today()); });
  await ev(() => { isNative = () => true; const ds = today(); D.nLast = ''; dayOf(ds).note = ''; D.noteOff['eve:' + ds] = ds; D._sched = [{ k: 'eve:' + ds, label: '오늘 닫기', text: '오늘 닫기 · 놓친 알림', tab: 'today', at: Date.now() - 120000 }]; D.nlog = (D.nlog || []).filter(x => x.via !== 'n' && x.k !== 'eve:' + ds); go('memo'); notifCatchUp(); isNative = () => false; });
  C('알림 뒤 10분 안에 열면 팝업 없이 맨 위에 붙는다', await ev(() => !!nTap && nTap.k === 'evening' && !!document.querySelector('#today #eveNote') && !document.getElementById('npop')), await ev(() => ({ nTap, last: D.nLast, log: (D.nlog || []).filter(x => /^eve/.test(x.k)), sched: D._sched, tab, eve: !!document.getElementById('eveNote') })));
  await ev(() => { nTap = null; });
  // 3. 하면 좋은 일
  await ev(() => { D.guide = D.guide || { done: {}, off: {} }; D.guide.off = Object.assign({}, D.guide.off, { write: true, notify: true, cal: true, agent: true }); render(); }); // 첫인사는 다 넘긴 사람
  C('사흘 안 마감이 있으면 하면 좋은 일을 묻지 않는다', await ev(() => openItems().some(r => r.due && r.due <= addDays(today(), 3) && !r.routine) ? ![...document.querySelectorAll('#today .sticky')].some(e => /하면 좋은 일/.test(e.textContent)) : true));
  await ev(() => { window._due0 = openItems().filter(r => r.due && r.due <= addDays(today(), 3) && !r.routine).map(r => [r, r.due]); window._due0.forEach(([r]) => { r.due = addDays(today(), 10); }); render(); });
  C('하면 좋은 일 포스트잇이 붙는다(어제 A 1개)', await ev(() => [...document.querySelectorAll('#today .sticky')].some(e => /하면 좋은 일/.test(e.textContent) && /HvsO/.test(e.textContent))));
  await ev(() => { window._due0.forEach(([r, d]) => { r.due = d; }); render(); });
  C('적은 글에서 마감을 읽는다', await ev(() => { const a = parseDue('실기 접수 금 18시 마감'), b = parseDue('월간 보고서 초안'), c = parseDue('금 18시 미팅'); return !!a && a.t === '18:00' && new Date(a.due + 'T00:00').getDay() === 5 && b === null && c === null; }));
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

  // 4-1. 계획: 배너 → 적기 → 한 장 → 딸린 할 일·루틴 → 할 일 탭에 계획 이름
  await ev(() => go('week'));
  C('할 일 맨 위에 계획 배너가 있다', await ev(() => { const b = document.querySelector('#week .pbanner'); return !!b && /새로운 계획이 있으신가요/.test(b.textContent); }));
  await pg.locator('#week .pbanner').click(); await pg.waitForTimeout(150);
  await pg.fill('#plName', '영어 회화'); await pg.fill('#plGoal', '국제 학회에서 질의응답을 영어로 받아낸다'); await pg.fill('#plHow', '평일 아침 리얼클래스 20분\n주 2회 영어 채팅');
  await pg.locator('#plan .dbtn').click(); await pg.locator('#dpick .dpq button', { hasText: '내일' }).click();
  C('날짜를 골라도 적던 글이 남는다', await ev(() => document.getElementById('plName').value === '영어 회화' && /리얼클래스/.test(document.getElementById('plHow').value)));
  await pg.locator('#plan .pbtns .go').click();
  const pid = await ev(() => (D.plans.find(p => p.name === '영어 회화') || {}).id || '');
  C('계획을 적으면 계획 한 장이 열린다', !!pid && await ev(id => planView === id && /국제 학회/.test(document.querySelector('#plan .plt').textContent) && [...document.querySelectorAll('#cover .t1')].some(e => e.textContent.includes('영어 회화')), pid));
  await pg.fill('#plAdd', '모의 질의응답 한 번'); await pg.locator('#plan .pladd .go').click();
  await pg.locator('#plan .pladd button', { hasText: '루틴' }).click(); await pg.fill('#plAdd', '리얼클래스 20분'); await pg.selectOption('#plN', '5'); await pg.locator('#plan .pladd .go').click();
  C('계획 안에서 할 일과 루틴을 적는다', await ev(id => { const a = D.rocks.find(r => r.title === '모의 질의응답 한 번'), b = D.rocks.find(r => r.title === '리얼클래스 20분'); return !!a && a.plan === id && a.bucket === 'important' && !!a.due && !!b && b.plan === id && b.routine === 5; }, pid));
  { const o = await overflow(); C('계획 한 장에 넘치는 줄이 없다', !o.length, o.slice(0, 4)); }
  await ev(() => go('week'));
  C('할 일 탭에 계획 줄과 진행이 보인다', await ev(() => { const r = document.querySelector('#week .prow'); return !!r && /영어 회화/.test(r.textContent) && /이번 주 루틴 0\/5/.test(r.textContent) && /할 일 1/.test(r.textContent); }));
  C('할 일 아래에 계획 이름이 붙는다', await ev(() => [...document.querySelectorAll('#week .item')].some(e => /모의 질의응답/.test(e.textContent) && /영어 회화/.test(e.querySelector('.m').textContent))));
  await ev(id => rowPlan('a1', id), pid); C('있던 할 일을 계획에 묶으면 계획과 역할이 같이 나온다', await ev(() => { const e = [...document.querySelectorAll('#week .item')].find(x => /고친 제목/.test(x.textContent)); return !!e && /영어 회화 · 연구자/.test(e.querySelector('.m').textContent); }));
  await ev(id => { rowPlan('a1', id); closePlan(id); }, pid);
  C('닫은 계획은 목록에서 빠지고 따로 모인다', await ev(() => !document.querySelector('#week .prow') && [...document.querySelectorAll('#week .lbl button')].some(b => /닫은 계획 1/.test(b.textContent))));
  await ev(id => closePlan(id), pid);
  C('병합: 서버 계획과 내 계획이 다 남는다', await ev(() => { const m = mergeState(pickState(), { plans: [{ id: 'p_srv', name: '서버', at: '2026-01-01T00:00:00Z', u: '2026-01-01T00:00:00Z' }] }).plans; return m.length === 2 && m.some(x => x.id === 'p_srv'); }));
  // 4-2. 오늘에서 칸 바꾸기
  await ev(() => { D.rocks.push({ id: 'tb1', week: weekKey(new Date()), bucket: 'urgent', role: '', title: '오늘에서 칸 바꿀 일', done: false, carry: 0, checks: {} }); dayOf(today()).picks.push('tb1'); todayOpen = null; eveOpen = ''; window._ne0 = (D.settings.notify || {}).evening; D.settings.notify = Object.assign({}, D.settings.notify, { evening: '23:59' }); go('today'); });
  const tbRow = () => pg.locator('#today .item', { hasText: '오늘에서 칸 바꿀 일' });
  C('오늘 줄에 지금 칸이 보인다', await ev(() => { const e = [...document.querySelectorAll('#today .item')].find(x => /오늘에서 칸 바꿀 일/.test(x.textContent)); return !!e && e.querySelector('.m .bk').textContent === 'A'; }));
  await tbRow().locator('.tx').click();
  C('오늘에서 제목을 누르면 고치는 줄이 펴진다', await tbRow().locator('.bslot').first().isVisible());
  { const o = await overflow(); C('오늘에서 넘치는 줄이 없다(칸 펼침)', !o.length, o.slice(0, 4)); }
  await tbRow().locator('.bslot button', { hasText: '닫기' }).click();
  C('닫기를 누르면 접힌다', await ev(() => !document.querySelector('#today .item .bslot')));
  await tbRow().locator('.tx').click();
  await tbRow().locator('.bslot button', { hasText: /^B$/ }).click();
  C('오늘에서 B로 옮기면 날짜를 멋대로 넣지 않고 묻는다', await ev(() => { const r = rock('tb1'); return r.bucket === 'important' && !r.due && !!document.getElementById('dpick') && !dayOf(today()).picks.includes('tb1'); }));
  await ev(() => closeDate(true));
  C('날짜를 안 고르면 원래 칸·오늘 칸으로 돌아온다', await ev(() => { const r = rock('tb1'); return r.bucket === 'urgent' && !r.due && dayOf(today()).picks.includes('tb1'); }));
  await ev(() => { rowBucket('tb1', 'important'); pickDate(addDays(today(), 5)); });
  C('날짜를 고르면 B로 옮기고 오늘 칸에서 뺀다', await ev(() => { const r = rock('tb1'); return r.bucket === 'important' && r.due === addDays(today(), 5) && !dayOf(today()).picks.includes('tb1'); }));
  await ev(() => { document.getElementById('quickIn').value = '칸 유지 확인 금요일까지'; setQuickB('important'); addToday(); });
  C('B를 고르면 적은 뒤에도 B가 남고, 끝의 마감 글자는 제목에서 덜어 낸다', await ev(() => { const r = D.rocks[D.rocks.length - 1]; const ok = quickB === 'important' && r.bucket === 'important' && r.title === '칸 유지 확인' && !!r.due; r._deleted = true; setQuickB('urgent'); save(); render(); return ok; }));
  await ev(() => { const wd = '일월화수목금토'[new Date(addDays(today(), 2) + 'T00:00').getDay()]; document.getElementById('quickIn').value = wd + '요일 다른 날 놓기 확인'; addToday(); });
  C('다른 날이 적힌 일은 오늘 칸이 아니라 그날 칸에 놓인다', await ev(() => { const r = D.rocks[D.rocks.length - 1], d2 = addDays(today(), 2); const ok = r.due === d2 && !dayOf(today()).picks.includes(r.id) && (dayOf(d2).picks || []).includes(r.id) && /칸에 적었어요/.test(document.getElementById('toast').textContent); r._deleted = true; dayOf(d2).picks = dayOf(d2).picks.filter(x => x !== r.id); save(); render(); return ok; }));
  C('마감 읽기: 문장 중간의 전에, 앞머리 내일', await ev(() => { const a = parseDue('내일 오후 2시 리뷰 전에 로고 수정안 완성'), b = parseDue('회의 전에 자료 출력'), c = parseDue('내일 엄마한테 전화', true), d = parseDue('오늘 내일 하는 일', true); return !!a && a.due === addDays(today(), 1) && a.t === '14:00' && !b && !!c && c.due === addDays(today(), 1) && !d; }));
  await ev(() => { window._nh1 = nowHM; const H = Date.prototype.getHours; window._gh = H; Date.prototype.getHours = function () { return 9; }; const td = today(), yd = addDays(td, -1); D.rocks.push({ id: 'bf1', week: weekKey(new Date()), bucket: 'urgent', role: '', title: '아침 한마디 확인할 일', due: td, done: false, carry: 0, checks: {} }); dayOf(td).picks.push('bf1'); dayOf(yd).part = ['bf1']; dayOf(yd).partNote = { bf1: '절반까지 함' }; window._cc1 = [D.settings.calUrl, D.calCache]; D.settings.calUrl = ''; D.calCache = null; delete (D.noteOff || {})['brief:' + td]; });
  C('캘린더가 없어도 아침 한마디가 오늘 먼저 할 것과 어제 한 줄을 말한다', await ev(() => { const h = briefHtml(today()); return /아침 한마디 확인할 일/.test(h) && /부터/.test(h) && /어제: 절반까지 함/.test(h); }), await ev(() => briefHtml(today()).replace(/<[^>]+>/g, ' ').slice(0, 200)));
  await ev(() => { Date.prototype.getHours = window._gh; const td = today(), yd = addDays(td, -1); rock('bf1')._deleted = true; dayOf(td).picks = dayOf(td).picks.filter(x => x !== 'bf1'); delete dayOf(yd).part; delete dayOf(yd).partNote; D.settings.calUrl = window._cc1[0]; D.calCache = window._cc1[1]; save(); render(); });
  C('마감 읽기: 전·느슨한 읽기', await ev(() => { const a = parseDue('엄마 생신선물 금 저녁전'), b = parseDue('금요일 회식 예약'), c = parseDue('금요일 회식 예약', true), d = parseDue('적금 넣기', true), e = parseDue('불량률 보고서 목 1시 리뷰전까지'); return !!a && a.cut === '엄마 생신선물' && !b && !!c && !d && !!e && e.t === '13:00' && !e.cut; }));
  await ev(() => { rock('tb1')._deleted = true; D.settings.notify.evening = window._ne0; save(); render(); });
  // 4-3. 일정 칸의 빈 시간
  await ev(() => { window._nh0 = nowHM; window.nowHM = () => '08:10'; const td = today(); window._cc0 = [D.settings.calUrl, D.calCache]; D.settings.calUrl = 'x'; D.calCache = { url: 'x', events: [{ date: td, start: '15:00', end: '16:00', title: '빈 시간 확인 회의' }] }; D.rocks.push({ id: 'gp1', week: weekKey(new Date()), bucket: 'urgent', role: '', title: '빈 시간에 넣을 일', done: false, carry: 0, checks: {} }); dayOf(td).picks.push('gp1'); _gapOpen = false; go('today'); });
  C('일정 칸에 빈 시간 줄이 나온다', await ev(() => { const g = document.querySelector('#today .ev.gap'); const f = window._g0 = freeGap(today()); return !!g && !!f && f[0] === '09:00' && g.textContent.includes(f[0]) && g.textContent.includes(f[1]) && /넣기/.test(g.textContent); }), await ev(() => JSON.stringify({ gap: freeGap(today()), appts: apptsOn(today()).map(r => [r.title, r.at, r.atEnd]), hm: nowHM() })));
  await pg.locator('#today .ev.gap .gapb').click();
  await pg.locator('#today .ev.gapc button', { hasText: '빈 시간에 넣을 일' }).click();
  C('빈 시간에 넣으면 그 시각의 일정이 된다', await ev(() => { const r = rock('gp1'); return r.at === today() + 'T09:00' && r.atEnd === window._g0[1] && r.block === true && [...document.querySelectorAll('#today .ev.appt')].some(e => /빈 시간에 넣을 일/.test(e.textContent) && /09:00/.test(e.textContent)); }));
  C('남은 빈 시간은 그 뒤부터다', await ev(() => { const g = freeGap(today()); return !g || g[0] >= window._g0[1]; }));
  { const o = await overflow(); C('오늘에서 넘치는 줄이 없다(빈 시간)', !o.length, o.slice(0, 4)); }
  await ev(() => { rock('gp1')._deleted = true; D.calCache = window._cc0[1]; if (window._cc0[0] === undefined) delete D.settings.calUrl; else D.settings.calUrl = window._cc0[0]; window.nowHM = window._nh0; save(); render(); });
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
  await pg.locator('#review .lbl button', { hasText: '+ 약속' }).click(); await pg.waitForTimeout(120); // 앱이 50ms 뒤 시각 칸에 초점을 주므로, 그 뒤에 적는다
  await pg.fill('#evTc', '13:00'); await pg.fill('#evEc', '14:00'); await pg.fill('#evNc', '점검 약속'); await pg.locator('#review .evadd button').click();
  C('달력에서 약속 적기(플래너에만, 끝 시각 포함)', await ev(() => { const r = D.rocks.find(x => x.title === '점검 약속'); return !!r && r.appt && r.at === addDays(today(), 1) + 'T13:00' && r.atEnd === '14:00'; }), await ev(() => ({ r: D.rocks.find(x => x.title === '점검 약속') || null, evAdd: _evAdd, form: !!document.getElementById('evNc'), val: (document.getElementById('evNc') || {}).value, toast: (document.querySelector('.toast') || {}).textContent, sel: calSel, now: Math.round(performance.now()), last: window.__r })));
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
  await ev(() => { const d3 = addDays(today(), 2); D.rocks.push({ id: 'fz1', week: weekKey(new Date()), bucket: 'important', role: '', title: '사흘 안 마감', due: d3, done: false, carry: 0, checks: {} }, { id: 'fz2', week: '2026-01-05', bucket: 'light', role: '', title: '날짜 지난 일', due: addDays(today(), -3), done: false, carry: 0, checks: {} }); delete D.freeNote; go('week'); });
  C('구독 전: 비서 포스트잇 한 장은 펴 보이고 나머지는 접힌다', await ev(() => { const ro = document.querySelectorAll('#week .sticky.ro'), fo = document.querySelectorAll('#week .sticky.fold'); return ro.length === 1 && fo.length >= 1 && /사흘 안 마감/.test(ro[0].textContent) && !document.querySelector('#week .sticky.blur.brief'); }), await ev(() => [...document.querySelectorAll('#week .sticky')].map(e => e.className)));
  C('구독 전: 펴진 한 장에 옮기기 버튼은 안 보이고 떼기는 보인다', await ev(() => { const bs = [...document.querySelectorAll('#week .sticky.ro button')], vis = b => getComputedStyle(b).display !== 'none'; return bs.filter(vis).every(b => b.classList.contains('unlock') || /dropNote/.test(b.getAttribute('onclick'))) && bs.some(b => vis(b) && /떼기/.test(b.textContent)) && bs.some(b => !vis(b)); }));
  await ev(() => { D.plans.filter(p => !p._deleted).forEach(p => delete p.closedAt); openPlan('new'); });
  C('구독 전: 두 번째 계획은 구독 안내로 간다', await ev(() => (spread() ? rightTab : tab) === 'sub' && openPlans().length >= 1));
  await ev(() => { D.plans.forEach(p => p._deleted = true); go('week'); openPlan('new'); });
  C('구독 전: 첫 계획은 적을 수 있다', await ev(() => planView === 'new' && !!document.getElementById('plName')));
  C('구독 안 한 화면에서도 탭이 열린다', (await ev(() => document.querySelector('#p-more .sheet').textContent.length)) > 10);

  await ev(() => { go('week'); openPlan('new'); }); await pg.waitForTimeout(150); await pg.fill('#plName', '탭 확인용'); await ev(() => savePlan()); await pg.waitForTimeout(80);
  C('글 칸에서 적고 저장한 뒤 아래 탭이 돌아온다', await ev(() => !document.body.classList.contains('kb')));
  await ev(() => { D.plans.forEach(p => { if (p.name === '탭 확인용') p._deleted = true; }); go('today'); });
  // 옆면 인덱스: 오른쪽 띠가 넓은 기기 흉내
  await ev(() => { D.preview = ''; edgeCheck(72); go('today'); });
  C('옆면 인덱스: 탭이 오른쪽 띠 안에 세로로 선다', await ev(() => { const bs = [...document.querySelectorAll('.tabbar button')].filter(b => getComputedStyle(b).display !== 'none').map(b => b.getBoundingClientRect()); return bs.length >= 4 && bs.every(r => r.left >= innerWidth - 73 && r.right <= innerWidth + 1) && bs[1].top > bs[0].bottom - 1; }));
  C('옆면 인덱스: 본문이 띠를 침범하지 않는다', await ev(() => { const c = document.getElementById('cover').getBoundingClientRect(); return c.right <= innerWidth - 71; }));
  await pg.locator('.tabbar button[data-tab="review"]').click();
  C('옆면 인덱스: 눌러서 달력으로 간다', await ev(() => (spread() ? rightTab : tab) === 'review' && document.querySelector('.tabbar button[data-tab="review"]').classList.contains('on')));
  C('옆면 인덱스: 펼친 화면에서는 오늘 탭이 빠지고 표지 안 탭이 숨는다', await ev(() => !spread() || (getComputedStyle(document.querySelector('.tabbar button[data-tab="today"]')).display === 'none' && (!document.querySelector('#cover .right') || getComputedStyle(document.querySelector('#cover .right')).display === 'none'))));
  C('옆면 인덱스: 기본은 띠지, 40px', await ev(() => !document.documentElement.dataset.edge && getComputedStyle(document.querySelector('.tabbar button[data-tab="week"]'), '::before').height === '40px'));
  await ev(() => { go('more'); openSec('cover'); });
  C('옆면 인덱스: 표지 화면에서 띠지/탭을 고른다', await ev(() => [...document.querySelectorAll('#coverBox .chips button')].map(b => b.textContent).join() === '띠지,탭'));
  await ev(() => setEdgeStyle('tab'));
  C('옆면 인덱스: 탭을 고르면 두툼한 탭 모양이 되고 저장된다', await ev(() => document.documentElement.dataset.edge === 'tab' && D.settings.edge === 'tab' && getComputedStyle(document.querySelector('.tabbar button[data-tab="week"]'), '::before').borderTopRightRadius === '8px' && document.querySelector('.tabbar button[data-tab="week"]').getBoundingClientRect().height >= 44));
  await ev(() => setEdgeStyle('flag'));
  await ev(() => { edgeCheck(0); go('today'); });
  C('띠가 없으면 아래 탭으로 돌아온다', await ev(() => !document.documentElement.classList.contains('edge-r') && (spread() || document.querySelector('.tabbar').getBoundingClientRect().width > innerWidth - 2)));
  // 첫날: 비서 인사 한 장, 하나씩 권하기
  await ev(() => { window._D0 = JSON.stringify(D); D.rocks = []; D.days = {}; D.plans = []; D.guide = { done: {}, off: {} }; D.nlog = []; D.settings = Object.assign({}, D.settings, { calUrl: '', calNative: false }); D.agent = null; D.preview = ''; go('today'); });
  C('첫날: 맨 위에 비서 인사 한 장만 있고 하면 좋은 일은 없다', await ev(() => { const st = [...document.querySelectorAll('#today .sticky')]; const hs = st.filter(e => e.classList.contains('start')); return hs.length === 1 && /오늘 할 것 하나만/.test(hs[0].textContent) && !st.some(e => /하면 좋은 일/.test(e.textContent)) && !(D.nlog || []).some(x => /하면 좋은/.test(x.label)); }));
  await ev(() => { go('today'); go('week'); });
  C('첫날: 할 일 탭에는 다섯 개 안내만 있고 계획 배너·A·B·C 고르기는 아직 없다', await ev(() => { const a = document.querySelector('#week .pbanner'), b = document.querySelector('#week .stickies'), q = document.querySelector('#today .qb'); return !a && !!b && !!q && q.style.display === 'none'; }));
  await ev(() => { go('today'); D.rocks.push({ id: 'f1', week: weekKey(new Date()), bucket: 'light', role: '', title: '첫 할 일', done: false, carry: 0, checks: {} }); dayOf(today()).picks.push('f1'); render(); });
  C('하나 적으면 다음 것(캘린더) 하나만 권한다', await ev(() => { const st = [...document.querySelectorAll('#today .sticky.start')]; return st.length === 1 && /캘린더/.test(st[0].textContent); }));
  await pg.locator('#today .sticky.start button', { hasText: '나중에' }).click();
  C('나중에를 누르면 그날은 더 권하지 않는다', await ev(() => !document.querySelector('#today .sticky.start')));
  await ev(() => { D.guide.skip.cal = addDays(today(), -1); render(); });
  C('나중에: 다음 날에는 그 항목 말고 다음 항목을 권한다', await ev(() => { const e = document.querySelector('#today .sticky.start'); return !!e && !/캘린더/.test(e.textContent); }));
  await ev(() => { D.guide.skip.cal = addDays(today(), -3); render(); });
  C('나중에: 사흘 뒤 같은 것을 다시 묻는다', await ev(() => { const e = document.querySelector('#today .sticky.start'); return !!e && /캘린더/.test(e.textContent); }));
  await pg.locator('#today .sticky.start button', { hasText: '다시 보지 않기' }).click();
  C('다시 보지 않기: 그 항목은 끝나고 다음 항목을 권한다', await ev(() => { const e = document.querySelector('#today .sticky.start'); return D.guide.off.cal === true && !!e && !/캘린더/.test(e.textContent) && /AI/.test(e.textContent); }));
  { const o = await overflow(); C('첫인사 한 장에 넘치는 줄이 없다', !o.length, o.slice(0, 4)); }
  await ev(() => { _moreNotes = false; renderToday(); });
  C('맨 위 포스트잇은 한 장만 펴 있고 나머지는 접힌다', await ev(() => { const vis = [...document.querySelectorAll('#today > .stickies')].filter(e => e.offsetParent && !e.closest('#moreNotes')); const more = document.getElementById('moreNotes'); return vis.length <= 2 && (!more || getComputedStyle(more).display === 'none'); }));
  C('의도 칸이 없고 오늘의 회고로 묶였다', await ev(() => !/의도/.test(document.getElementById('today').textContent) && /오늘의 회고/.test(document.getElementById('today').textContent)));
  await ev(() => { _moreNotes = true; renderToday(); });
  await ev(() => { D = JSON.parse(window._D0); save(); go('today'); });
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
  await call('items', 'POST', { src: 'mcp', items: [{ text: '영어 회화', kind: 'plan', goal: '질의응답을 영어로', how: '리얼클래스', due: '2026-12-31' }] });
  S = await call('state', 'GET'); const sp = (S.plans || [])[0];
  C('비서가 계획을 적는다(kind=plan)', !!sp && sp.name === '영어 회화' && sp.goal === '질의응답을 영어로' && sp.due === '2026-12-31', S.plans);
  await call('items', 'POST', { items: [{ text: '리얼클래스 20분', kind: 'item', bucket: 'B', routine: 5, plan: '영어 회화' }, { text: '모의 질의응답', kind: 'item', bucket: 'B', due: '2026-12-06', plan: sp.id }, { id: sp.id, op: 'update', goal: '고친 목표' }] });
  S = await call('state', 'GET');
  C('비서가 루틴·할 일을 계획에 묶는다(이름·id)', S.rocks.filter(r => r.plan === sp.id).length === 2 && S.plans[0].goal === '고친 목표', S.rocks.map(r => [r.title, r.plan]));
  const rd0 = await mcp('tools/call', { name: 'planner_read', arguments: {} });
  C('planner_read에 계획과 묶인 일이 나온다', /## 계획/.test(rd0) && /고친 목표/.test(rd0) && /\[계획: 영어 회화\] 모의 질의응답/.test(rd0), rd0.slice(0, 300));
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
  } catch (e) { fails.push('점검이 중간에 멈춤 → ' + (e && e.message || e).toString().split('\n').slice(0, 3).join(' ') + ' / 마지막 통과: ' + passed[passed.length - 1]); }
  await browser.close();
  console.log(`통과 ${passed.length} · 실패 ${fails.length}`); fails.forEach(f => console.log('  ✗ ' + f));
  process.exit(fails.length ? 1 : 0);
})();
