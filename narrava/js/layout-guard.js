// layout-guard.js
//
// Closes the strip at the bottom of the installed iPhone app, and can show
// the real numbers behind it. Consumer app only.
//
// What was found (see DOCUMENTATION.md, "iOS bottom gap"): with a simulated
// safe area, every Narrava screen and state paints all the way to the bottom
// edge — the app itself leaves no gap. So on the phones where a strip
// remains, the page is being handed a layout viewport that is SHORTER than
// the physical screen, and the strip is the page background showing
// through below it. That is also why setting the background colour last
// time only changed the strip's colour: `position:fixed; inset:0` is
// measured against that same short viewport, so it can't reach the bottom
// either. (100vh / 100dvh / height:100% are all measured against it too.)
//
// What this does about it — nothing unless the shortfall is real:
//   1. An invisible probe pinned to the layout viewport's own edges
//      measures the viewport the browser actually gave us.
//   2. On an iPhone running as an installed app (portrait, phone width), if
//      that is shorter than the screen by 2–120px, the shortfall is written
//      to --app-shortfall on <html>.
//   3. styles.css then extends .phone that far past the viewport's bottom
//      edge, and treats the extension as bottom safe area (--safe-bottom), so
//      bottom controls still clear the home indicator.
// Anywhere else (desktop, Android, a browser tab, no shortfall) the value
// stays 0px and nothing changes.
//
// It is re-measured on load (several times, since iOS can report a stale
// size right at launch), on resize / rotation, and whenever the app comes
// back to the foreground.
//
// UPDATE from a real iPhone (screen 390x844, viewport 797, shortfall 47): the
// inner screens were checked directly — under those exact numbers every screen
// inside .phone reaches the full 844, so they were never the cause. What the
// numbers do show is that 47 is exactly the TOP safe-area height of that
// iPhone (its status bar), not the bottom one (34). So the 47px iOS withheld
// may be at the TOP, in which case extending the bottom was the wrong edge —
// and would push the bottom of the app off the screen. The guard now tells
// the two apart before doing anything, using env(safe-area-inset-top), which
// is non-zero only when the page is allowed to draw UNDER the status bar:
//   top inset > 0  -> the status bar overlaps the page, so the missing part
//                     is at the bottom -> extend the bottom (as before).
//   top inset = 0  -> the page starts BELOW the status bar (an opaque status
//                     bar), so the missing part is the status bar itself at
//                     the top; nothing to extend, and extending the bottom
//                     would only push the app off-screen. Left alone.
//
// Honest limit: this could only be tested with a simulated shortfall in
// desktop Chrome, which proves the measuring and the layout arithmetic. It
// cannot prove that iOS PAINTS content in the strip it excluded from the
// viewport. If a strip remains on a real iPhone, open the diagnostics
// panel (below) and the numbers show exactly why.
//
// DIAGNOSTICS PANEL — shows the raw numbers on screen so they can be read
// off a real device. Open it by tapping the avatar on the Profile screen 5
// times quickly, or by loading the page with ?layout=1 in the address bar.
// Tap the panel to close it. It changes nothing.

(function(){
  var root = document.documentElement;
  var ua = navigator.userAgent;
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function isStandalone(){
    return window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }

  // Pinned to the layout viewport's own top/bottom, never touched by any
  // of our layout, so it reports what the browser actually provided.
  var probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;bottom:0;visibility:hidden;pointer-events:none;';
  document.body.appendChild(probe);

  function screenHeightPortrait(){
    return Math.max(screen.width, screen.height); // iOS reports screen.* in portrait points, whatever the orientation
  }

  // env(safe-area-inset-top) as a number of px (0 when the page can't draw under the status bar)
  var topProbe = document.createElement('div');
  topProbe.setAttribute('aria-hidden', 'true');
  topProbe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);';
  document.body.appendChild(topProbe);
  function safeTop(){ return parseFloat(getComputedStyle(topProbe).paddingTop) || 0; }

  function measure(){
    var vpH = probe.getBoundingClientRect().height;
    var portrait = window.matchMedia('(orientation: portrait)').matches;
    var diff = Math.round(screenHeightPortrait() - vpH);
    var applicable = isIOS && isStandalone() && portrait && window.innerWidth <= 600;
    var gap = (applicable && diff > 1 && diff <= 120) ? diff : 0;
    var top = safeTop();
    // Which edge is missing? See the header. Only the bottom case is acted on.
    var missingEdge = gap ? (top > 0 ? 'bottom' : 'top') : 'none';
    var shortfall = missingEdge === 'bottom' ? gap : 0;
    return { viewportHeight: vpH, screenHeight: screenHeightPortrait(), diff: diff, applicable: applicable, gap: gap, safeTop: top, missingEdge: missingEdge, shortfall: shortfall };
  }

  var last = null;
  function apply(){
    var m = measure();
    if(last !== m.shortfall){
      root.style.setProperty('--app-shortfall', m.shortfall + 'px');
      last = m.shortfall;
    }
    return m;
  }

  apply();
  [250, 800, 2000, 4000].forEach(function(ms){ setTimeout(apply, ms); });
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', function(){ setTimeout(apply, 200); });
  window.addEventListener('pageshow', apply);
  document.addEventListener('visibilitychange', function(){ if(!document.hidden) apply(); });

  // ---------- diagnostics panel ----------
  function envPx(prop){
    var el = document.createElement('div');
    el.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-' + prop + ':env(safe-area-inset-' + prop + ',0px);';
    document.body.appendChild(el);
    var v = getComputedStyle(el)['padding' + prop.charAt(0).toUpperCase() + prop.slice(1)];
    el.remove();
    return v;
  }

  function showDiagnostics(){
    var old = document.getElementById('layoutDiagPanel');
    if(old){ old.remove(); return; }
    var m = apply();
    var phone = document.querySelector('.phone');
    var pr = phone ? phone.getBoundingClientRect() : null;
    var vv = window.visualViewport;
    var meta = document.querySelector('meta[name="viewport"]');
    var lines = [
      'NARRAVA LAYOUT DIAGNOSTICS  (use the buttons below)',
      '',
      'installed app (standalone): ' + isStandalone() + '   navigator.standalone=' + window.navigator.standalone,
      'display-mode standalone: ' + window.matchMedia('(display-mode: standalone)').matches,
      'iOS detected: ' + isIOS + '   orientation portrait: ' + window.matchMedia('(orientation: portrait)').matches,
      '',
      'screen.width x height : ' + screen.width + ' x ' + screen.height,
      'screen.avail w x h     : ' + screen.availWidth + ' x ' + screen.availHeight,
      'window.inner w x h     : ' + window.innerWidth + ' x ' + window.innerHeight,
      'window.outer w x h     : ' + window.outerWidth + ' x ' + window.outerHeight,
      'visualViewport w x h   : ' + (vv ? Math.round(vv.width) + ' x ' + Math.round(vv.height) + '  (offsetTop ' + Math.round(vv.offsetTop) + ')' : 'n/a'),
      'documentElement client : ' + root.clientWidth + ' x ' + root.clientHeight,
      'layout-viewport probe  : height ' + Math.round(m.viewportHeight * 10) / 10,
      '',
      'safe-area env top/right/bottom/left: ' + [envPx('top'), envPx('right'), envPx('bottom'), envPx('left')].join(' / '),
      'screen - viewport = ' + m.diff + 'px   (safe-area top = ' + m.safeTop + 'px)',
      'missing edge inferred: ' + m.missingEdge.toUpperCase() + '   -> applied bottom shortfall: ' + m.shortfall + 'px',
      'visualViewport pageTop/offsetTop: ' + (vv ? Math.round(vv.pageTop) + ' / ' + Math.round(vv.offsetTop) : 'n/a'),
      '--app-shortfall = ' + root.style.getPropertyValue('--app-shortfall'),
      '',
      '.phone top..bottom : ' + (pr ? Math.round(pr.top) + ' .. ' + Math.round(pr.bottom) + '  (height ' + Math.round(pr.height) + ')' : 'not found'),
      '.phone position    : ' + (phone ? getComputedStyle(phone).position : 'n/a'),
      'devicePixelRatio   : ' + window.devicePixelRatio,
      'viewport meta      : ' + (meta ? meta.getAttribute('content') : 'MISSING'),
      '',
      'UA: ' + ua
    ];
    var wrap = document.createElement('div');
    wrap.id = 'layoutDiagPanel';
    var panel = document.createElement('pre');
    panel.textContent = lines.join('\n');
    panel.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483647;margin:0;padding:calc(env(safe-area-inset-top,0px) + 10px) 10px 12px;' +
      'background:rgba(0,0,0,0.92);color:#8fef8f;font:11px/1.35 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-all;' +
      '-webkit-user-select:text;user-select:text;';
    wrap.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483647;';
    panel.style.position = 'static';
    var buttons = document.createElement('div');
    buttons.style.cssText = 'display:flex;gap:8px;padding:0 10px 10px;background:rgba(0,0,0,0.92);';
    function btn(label, fn){ var b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.style.cssText = 'flex:1;min-height:44px;font:600 13px sans-serif;background:#1c271e;color:#fff;border:1px solid #567;border-radius:8px;'; b.addEventListener('click', function(e){ e.stopPropagation(); fn(); }); buttons.appendChild(b); }
    btn('Edge markers on/off', toggleMarkers);
    btn('Close', function(){ wrap.remove(); });
    wrap.appendChild(panel);
    wrap.appendChild(buttons);
    document.body.appendChild(wrap);
  }

  // Colored bars that make it obvious, in one screenshot, exactly which
  // physical edges are painted:
  //   RED   4px  at the very top of .phone
  //   GREEN 4px  at the very bottom of the LAYOUT VIEWPORT (the 797px area iOS gave)
  //   BLUE  8px  at the very bottom of .phone (the extended edge, viewport coordinates + shortfall)
  // If the blue bar is visible on the real screen, the extension is being
  // painted; if only the green one is, iOS is not painting past the viewport.
  function toggleMarkers(){
    var old = document.getElementById('layoutEdgeMarkers');
    if(old){ old.remove(); return; }
    var phone = document.querySelector('.phone'); if(!phone) return;
    var box = document.createElement('div');
    box.id = 'layoutEdgeMarkers';
    box.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2147483646;';
    function bar(css, text){ var b = document.createElement('div'); b.style.cssText = 'position:absolute;left:0;right:0;font:700 10px sans-serif;color:#000;text-align:center;' + css; b.textContent = text; box.appendChild(b); }
    bar('top:0;height:14px;background:#ff3b30;', 'RED = top of .phone');
    bar('bottom:0;height:14px;background:#0a84ff;', 'BLUE = bottom of .phone');
    phone.appendChild(box);
    var g = document.createElement('div');
    g.id = 'layoutEdgeMarkersViewport';
    g.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:14px;background:#34c759;z-index:2147483647;pointer-events:none;font:700 10px sans-serif;color:#000;text-align:center;';
    g.textContent = 'GREEN = bottom of the layout viewport';
    document.body.appendChild(g);
    var origRemove = box.remove.bind(box);
    box.remove = function(){ g.remove(); origRemove(); };
  }

  // 5 quick taps on the Profile avatar
  var taps = [];
  document.addEventListener('click', function(e){
    if(!(e.target && e.target.closest && e.target.closest('.profile-avatar'))) return;
    var now = Date.now();
    taps = taps.filter(function(t){ return now - t < 4000; });
    taps.push(now);
    if(taps.length >= 5){ taps = []; showDiagnostics(); }
  }, true);

  if(/[?&]layout=1\b/.test(location.search)) setTimeout(showDiagnostics, 600);

  window.narravaLayoutDiagnostics = showDiagnostics;
})();
