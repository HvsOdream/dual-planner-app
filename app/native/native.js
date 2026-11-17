// DUAL Planner — 앱(Capacitor) 안에서만 붙는 것. 웹에서는 아무 일도 안 한다.
(function () {
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  document.documentElement.classList.add('native');
  var P = {}; ['StatusBar', 'App'].forEach(function (k) { P[k] = (C.Plugins && C.Plugins[k]) || (C.registerPlugin ? C.registerPlugin(k) : null); });
  // 상태 표시줄: 종이색 머리띠 위에 짙은 글씨
  try { P.StatusBar && P.StatusBar.setStyle({ style: 'LIGHT' }); } catch (e) {}
  // 앱이 다시 앞으로 오면 서버에서 비서가 적은 것 받아오기
  try { P.App && P.App.addListener('appStateChange', function (s) { if (!s.isActive) return; if (window.pullState) window.pullState(false); if (window.takePending) window.takePending(); if (window.loadCal) window.loadCal(false); }); } catch (e) {}
  // 위젯·잠금 화면의 「적기」(dualplanner://write)로 열리면 적는 칸을 바로 띄운다
  var W = function (u) { if (!u || String(u).indexOf('dualplanner://write') !== 0) return; var n = 0, t = setInterval(function () { if (window.dualWrite) { clearInterval(t); window.dualWrite(); } else if (++n > 40) clearInterval(t); }, 150); };
  try { P.App && P.App.addListener('appUrlOpen', function (e) { W(e && e.url); }); } catch (e) {}
  try { P.App && P.App.getLaunchUrl && P.App.getLaunchUrl().then(function (r) { W(r && r.url); }).catch(function () {}); } catch (e) {}
})();
