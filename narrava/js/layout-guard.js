// iPhone layout diagnostics. The bottom extension is off (iOS doesn't paint past
// its viewport); the fix is the opaque status bar in index.html. Panel: 5 avatar taps or ?layout=1.

(function(){
  var root = document.documentElement;
  var ua = navigator.userAgent;
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function isStandalone(){
    return window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }

  // Probe pinned to the layout viewport's edges
  var probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;bottom:0;visibility:hidden;pointer-events:none;';
  document.body.appendChild(probe);

  function screenHeightPortrait(){
    return Math.max(screen.width, screen.height); // iOS reports screen.* in portrait points, whatever the orientation
  }

  // env(safe-area-inset-top) in px
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
    var missingEdge = gap ? (top > 0 ? 'bottom' : 'top') : 'none';
    var shortfall = 0; // never extend (see the top)
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
      'status bar style meta: ' + ((document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]') || {getAttribute: function(){ return 'MISSING'; }}).getAttribute('content')) + '   --top-safe: ' + getComputedStyle(root).getPropertyValue('--top-safe').trim(),
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

  // Edge markers: red = top of .phone, green = viewport bottom, blue = bottom of .phone
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
