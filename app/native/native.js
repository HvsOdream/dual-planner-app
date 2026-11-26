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
  // 비서 연결(dualplanner://connect?rid=…): 브라우저의 「듀얼플래너 앱에서 허용」으로 열리면 허용을 묻는 창을 띄운다
  var K = function (u) { var m = /^dualplanner:\/\/connect\/?\?(?:.*&)?rid=([\w]+)/.exec(String(u || '')); if (!m) return false; var n = 0, t = setInterval(function () { if (window.dualConnect) { clearInterval(t); window.dualConnect(m[1]); } else if (++n > 40) clearInterval(t); }, 150); return true; };
  var W = function (u) { if (K(u)) return; if (!u || String(u).indexOf('dualplanner://write') !== 0) return; var n = 0, t = setInterval(function () { if (window.dualWrite) { clearInterval(t); window.dualWrite(); } else if (++n > 40) clearInterval(t); }, 150); };
  // 속지: 밖에서 끝난 결제(가족 승인·환불)가 들어오면 다시 맞춘다
  try { var N = (C.Plugins && C.Plugins.DualNative) || (C.registerPlugin ? C.registerPlugin('DualNative') : null); N && N.addListener && N.addListener('iapUpdate', function () { if (window.subSync) window.subSync(); }); } catch (e) {}
  try { P.App && P.App.addListener('appUrlOpen', function (e) { W(e && e.url); }); } catch (e) {}
  try { P.App && P.App.getLaunchUrl && P.App.getLaunchUrl().then(function (r) { W(r && r.url); }).catch(function () {}); } catch (e) {}
})();
