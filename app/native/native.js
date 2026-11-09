// DUAL Planner — 앱(Capacitor) 안에서만 붙는 것. 웹에서는 아무 일도 안 한다.
(function () {
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  document.documentElement.classList.add('native');
  var P = C.Plugins || {};
  // 상태 표시줄: 네이비 표지 위에 흰 글씨
  try { P.StatusBar && P.StatusBar.setStyle({ style: 'LIGHT' }); } catch (e) {}
  // 앱이 다시 앞으로 오면 서버에서 비서가 적은 것 받아오기
  try { P.App && P.App.addListener('appStateChange', function (s) { if (!s.isActive) return; if (window.pullState) window.pullState(false); if (window.takePending) window.takePending(); if (window.loadCal) window.loadCal(false); }); } catch (e) {}
})();
