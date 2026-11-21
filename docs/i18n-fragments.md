# 영어로 켜기 전에 손볼 문장

> 0.7.76: 아래 「조각을 이어 붙인 문장」 가운데 49곳은 `tools/i18n-merge.js`로 한 문장으로 합쳤다(`md(d) + '까지'` → `T('{d}까지', …)`).
> 남은 것: 조건부 꼬리가 붙는 곳(`계획` + `{due}까지` → 영어에서 `Planby 12/13`), `{n}단계 중 M`, `B 1 to A` 같은 개수 표기, 그리고 아래 「도구가 건드리지 않은 곳」.

0.7.75에서 화면 함수의 한국어를 `T()`로 감쌌다(947곳, 열쇠 697개). 한국어 화면은 그대로다.
아래는 도구가 문장을 통째로 잡지 못한 곳이다. 한국어는 조사가 뒤에 붙고 영어는 앞에 오기 때문에, 조각을 이어 붙인 문장은 영어에서 어순이 어긋난다
(예: `11/22by Today`, `Planby 12/13`, `B 1 to A`). 문장 하나를 통째로 열쇠로 삼도록 코드를 고쳐야 한다. 쓰는 법은 `docs/i18n.md`.

## 조각을 이어 붙인 문장 (76곳)

`'글자' + 값 + '글자'` 꼴이거나, 값이 복잡해서 문장이 끊긴 곳.

- `· ' : '') : '') + (waiting(r) ? '기다리는 중 · ' : '') + (r.routine ? ('주 '`
- `) + (waiting(r) ? '기다리는 중 · ' : '') + (r.routine ? ('주 '+r.routine+'회'`
- `due !== ad || !at) ? (md(r.due) + (r.dueT ? ' ' + r.dueT : '') + '까지만'`
- ` 'note' ? '비서 메모' : agentLabel(x.src || (D.agent || {}).name) + ' 할 일'`
- `개발용 · 안전영역 `
- `계획' : pl ? esc(pl.name) : '계획'; t2 = planView === 'new' ? '할 일' : '계획'`
- `Vols().find(x => x.id === volSel) || curVol(); t1 = volName(v) + ' 속지'`
- `se if (tab==='close') { const v = curVol(); t1 = volName(v) + ' 속지 닫기'`
- `openDate('', { title: 'B · ' + t + ' · 언제까지'`
- `e === d ? (r.on ? (r.dueT || '') : (r.dueT ? r.dueT + ' ' : '') + '마감'`
- ` + ' ' : '') + '마감') : md(r.due) + (r.dueT ? ' ' + r.dueT : '') + '까지'`
- `</div>' + c.plan.map(x => row(x.r, false, x.r.due ? md(x.r.due) + '까지'`
- `할 일 ${items.length}개`
- `h += aNote({ label: '마감 임박', meta: soon.length + '개'`
- `끝낸 일 ${done.length}개`
- `. 한 줄 일기 ${notes}일.`
- `if (none / tot >= 0.3) h += aNote({ label: '시간 쓰임', meta: '캘린더 '`
- ` tot >= 0.3) h += aNote({ label: '시간 쓰임', meta: '캘린더 ' + f(tot) + '시간'`
- `else h += aNote({ label: '시간 쓰임', meta: '캘린더 '`
- `else h += aNote({ label: '시간 쓰임', meta: '캘린더 ' + f(tot) + '시간'`
- `1년 속지`
- `한 번 사면 열두 달 써요. 자동으로 다시 결제되지 않아요`
- `(Object.keys(evRoles())).find(x => evId(x) === id); return t ? '일정 · '`
- ` => x.name + ' ' + (x.items || []).length).join(' · ') + ' 이렇게 묶어 볼까요'`
- `역할 ${D.roles.length}개 · 할 일 ${k}개`
- `2px;color:var(--muted)">${on ? (c2 && c2.error ? esc(c2.error) : '일정 '`
- `error ? esc(c2.error) : '일정 ' + ((c2 && c2.events) || []).length + '개'`
- `구글 캘린더 › 설정 › 내 캘린더 › 캘린더 통합 › 비공개 주소(iCal 형식)`
- `il) + 1; return n > 14 ? '' : note('subend:' + D.sub.until, n + '일 남음'`
- `return note('trial:' + ds, n > 1 ? n + '일 남음'`
- `if (b.gap && b.gapTop) add(b.gapTop, b.gap[0] + ' 빔'`
- `g().on ? '${w} · 알림이 꺼져 있어요(메뉴 › 알림)' : '${w} · ${lead ? lead + '분 전에'`
- `${md(r.due)}까지 · `
- `내일 일정 ${nAll}개`
- `? '어제' : md(d)) : ''; return d ? (n ? w + ': ' + esc(n) : w + ' 일부 진행'`
- `v class="bev" style="white-space:normal">나중에 칸에 ${wk >= 1 ? wk + '주째 '`
- `일정 ${cnt}개`
- `due === tm ? '내일' : md(g.due)) + (g.dueT ? ' ' + g.dueT : '') + '까지인 '`
- `오늘 있는 일: `
- `부터`
- `h, hm = t => { const [h, m] = t.split(':').map(Number); return h + '시'`
- `[h, m] = t.split(':').map(Number); return h + '시' + (m ? ' ' + m + '분'`
- `내일까지: ${short(tmr[0].title)}`
- `if (pre) return { title: '오늘 닫기', body: pre + '한 줄 일기도 잊지 말고요'`
- `(); toast('아침 ${c.morning} 브리핑${c.off && c.off.evening ? '' : ' · 저녁 '`
- `g ? '' : ' · 저녁 ' + c.evening}${c.off && c.off.sunday ? '' : ' · 일요일 '`
- `ion value="${m}" ${apptLead() === m ? 'selected' : ''}>${m ? m + '분 전'`
- `toast('할 일에 기록했어요 · '`
- ` h + '</svg>' + (q.end > gEnd ? '<div class="pvmore">${after ? '이 뒤로 '`
- `.end > gEnd ? '<div class="pvmore">${after ? '이 뒤로 ' + after + '단계 · '`
- `const sub = md(q.end) + '까지'`
- `"pn"><b>${esc(p.name)}</b><i>${esc(p.closedAt ? md(p.closedAt) + ' 닫음'`
- `nherit;flex:none" onclick="plStepDue(${i})">${x.due ? md(x.due) + '까지'`
- `${n}" ${n === a.routine.per ? 'selected' : ''}>${n === 7 ? '매일' : '주 '`
- `=== a.routine.per ? 'selected' : ''}>${n === 7 ? '매일' : '주 ' + n + '회'`
- `="bnd ask" onclick="planDue('${r.id}')">${r.guess ? md(r.guess) + '쯤?'`
- `.title} 고르기"><div class="dph"><b>${dp.title}</b><span>${dp.val ? '지금 '`
- `important' ? '언제까지' : '마감'}'},v=>rowDue('${r.id}',v))">${r.due ? '마감 '`
- `planOf(g).name)}</span><span class="grpm">${rs.length}개${nx ? ' · 다음 '`
- `esc(r.role), ((D.days[calSel] || {}).partNote || {})[r.id] ? '일부 진행: '`
- `>${esc(c.title)}</div><div class="hint">${c.due ? md(c.due) + '에 해 보기'`
- `: backSticky('이번 주 리뷰', lines + '줄'`
- `v class="tx">${esc(c.title)}</div><div class="hint">${c.routine ? '주 '`
- `(c.title)}</div><div class="hint">${c.routine ? '주 ' + c.routine + '회'`
- `">${c.routine ? '주 ' + c.routine + '회' : (c.due ? md(c.due) + '에 해 보기'`
- `else h += backSticky('다음 주 후보', cands.length + '장'`
- `'1년 리뷰', v.summary.split(/\n|(?<=다\.)\s/).filter(Boolean).length + '줄'`
- `'1년 리뷰', v.summary.split(/\n|(?<=다\.)\s/).filter(Boolean).length + '줄'`
- `.vols.push(nv); refill = null; save(); toast(volName(nv) + ' 속지를 끼웠어요'`
- `) - new Date(a.at)) / 60000); return m < 1 ? '방금' : m < 60 ? m + '분 전'`
- `< 1 ? '방금' : m < 60 ? m + '분 전' : m < 1440 ? Math.round(m/60) + '시간 전'`
- `전' : m < 1440 ? Math.round(m/60) + '시간 전' : Math.round(m/1440) + '일 전'`
- `(!/popup_closed|user_cancelled|canceled/.test(m)) toast('Apple 로그인 실패'`
- `n(',') + ']'; if (!/canceled|cancelled/.test(m)) toast('Google 로그인 실패'`
- `st m = (e && (e.reason || e.error || e.message)) || ''; toast('로그인 실패'`
- `class="acct"><div class="who"><b>${esc(a.name || a.email || pv + ' 계정'`

## 도구가 건드리지 않은 곳 (20곳)

따옴표 안에 태그가 든 문구, 비교에 쓰인 문구 등. 하나씩 보고 정한다.

- `비교: FEATS.find(x => x[1] === label), w = f ? f[2] : ''; return w === '할 일'`
- `비교: == label), w = f ? f[2] : ''; return w === '할 일' ? 'week' : w === '달력'`
- `따옴표 안 태그: /span><span class="nb"><b>${esc(x.label)}${x.via === 'n' ? '<i>알림</i>'`
- `따옴표 안 태그: }${new Date(x.at).getTime() > notisSince ? '<u aria-label="새 알림"></u>'`
- `비교: s)(내일|모레)(?=\s|$)/, (m, a, w) => g.due === addDays(today(), w === '내일'`
- `글자 다루기: '마감 ${fmtDue(r)}'); else if (far) toastAsk('${md(far.due)} ${'일월화수목금토'`
- `비교: /(^|\s)(내일|모레)(?=\s|$)/, (m, a, w) => g.due === addDays(td, w === '내일'`
- `글자 다루기: > !d ? '할 일 목록에 (필요한 날 오늘로)' : d === td ? '오늘' : '${md(d)} ${'일월화수목금토'`
- `따옴표 안 태그:  일 제목과 날짜, 다가오는 일정 제목과 날짜<br>종이 찍기를 누를 때: 찍은 메모 사진(읽는 데만 쓰고 저장하지 않아요)'`
- `따옴표 안 태그: e">${roleItems[r.id] ? '' : '<option value="" selected>정하기 전</option>'`
- `비교: ss="inp" id="pplIn${i}" placeholder="${esc(x.guess && x.guess !== '모름'`
- `따옴표 안 태그: lass="pk">●</span><span class="pn"><b>1년 속지${had ? ' <em>다시 사는 값</em>'`
- `따옴표 안 태그: 번 사면 열두 달 써요. 자동으로 다시 결제되지 않아요${on ? '<br>미리 사면 지금 속지가 끝난 다음 날부터 이어져요'`
- `비교: > { if (x && x.name && !(x.name in pm0) && x.guess && x.guess !== '모름'`
- `따옴표 안 태그: v class="npf"><button onclick="closePop()">붙여 두기</button></div></div>'`
- `따옴표 안 태그:  ${p.length}개)' : '<span style="color:var(--check)">잡힌 알림이 없어요</span>'`
- `글자 다루기:  viewBox="0 0 322 ${TOP + rows * RH}" aria-hidden="true">' + '월화수목금토일'`
- `따옴표 안 태그: iv class="bev" style="white-space:normal;opacity:.7">단계를 모두 뺐어요</div>'`
- `따옴표 안 태그: ${needDue ? '<div class="arh">적으면 언제까지만 할지 물어요</div>'`
- `따옴표 안 태그:  '<button class="gbtnN" onclick="googleLogin()">Google로 계속하기</button>'`

## 그 밖에 영어 화면에서 보인 것

- 달력 머리 `11/2026`, 표지의 `Day 1` 줄바꿈
- 메모 탭의 안내 포스트잇 예시가 한국어 그대로
- 맨 위 상수(`FEATS`, `MORE_SECS` 등)와 onclick 안의 문구는 아직 감싸지 않음
- 날짜 읽기(`parseDue`)는 한국어 전용
