// protect.js
//
// Casual-copying and DevTools DETERRENTS for the consumer app. Loaded first
// in index.html, never by any admin page. These make casual right-click
// saving, text copying and poking around harder — they are not security.
// Anyone determined can get around every one of them (turn JavaScript off,
// use another browser, capture the screen). Real protection of the video
// lives on the server: short-lived signed links and the lock rule enforced
// by the bunny-signed-playback-url function.
//
// Four parts:
//   1. right-click / long-press context menu blocked
//   2. text selection, copy, cut and drag blocked
//   3. the usual DevTools / view-source keyboard shortcuts blocked
//   4. a `debugger` loop that stops execution whenever DevTools is open
//
// Text fields are always exempt from 1 and 2 (comment box, sign-in, search,
// username) — blocking selection/paste there would make the app unusable.
//
// Developer escape hatch: run  localStorage.narrava_devtools_ok = '1'  in
// the console, then reload, and every part below is switched off (so the
// site can still be debugged in production). Remove it with
//  localStorage.removeItem('narrava_devtools_ok').  The check runs before
// anything is installed, so the `debugger` loop can't get in the way of
// running that one line — but if DevTools is already open and paused on it,
// press Resume, or open DevTools only after setting the flag.

(function(){
  var devBypass = false;
  try { devBypass = localStorage.getItem('narrava_devtools_ok') === '1'; } catch(_e){ /* storage blocked — deterrents stay on */ }
  if(devBypass) return;

  // Marks the page so the CSS in styles.css (user-select:none) only ever
  // applies here, not on the admin pages that share the same stylesheet.
  document.documentElement.classList.add('protected');

  // Anything the person types into stays fully usable.
  function isEditable(el){
    if(!el || !el.closest) return false;
    return !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
  }

  // ---- 1. right-click / long-press menu ----
  document.addEventListener('contextmenu', function(e){
    if(isEditable(e.target)) return;
    e.preventDefault();
  }, true);

  // ---- 2. selection, copy, cut, drag ----
  // (CSS user-select:none does most of this; these cover the rest —
  // select-all, drag-selecting from a field, copy of an existing selection,
  // dragging an image out.)
  document.addEventListener('selectstart', function(e){
    if(isEditable(e.target)) return;
    e.preventDefault();
  }, true);
  ['copy', 'cut', 'dragstart'].forEach(function(type){
    document.addEventListener(type, function(e){
      if(isEditable(e.target)) return;
      e.preventDefault();
    }, true);
  });

  // ---- 3. DevTools / view-source shortcuts ----
  // F12; Ctrl/Cmd+Shift+I (inspector), +J (console), +C (element picker);
  // Ctrl+U / Cmd+Option+U (view source). Matched on e.code (physical key) so
  // it doesn't depend on keyboard layout or on Shift changing e.key's case.
  document.addEventListener('keydown', function(e){
    var mod = e.ctrlKey || e.metaKey;
    var blocked =
      e.key === 'F12' || e.code === 'F12' ||
      (mod && e.shiftKey && (e.code === 'KeyI' || e.code === 'KeyJ' || e.code === 'KeyC')) ||
      (e.metaKey && e.altKey && (e.code === 'KeyI' || e.code === 'KeyJ' || e.code === 'KeyC' || e.code === 'KeyU')) ||
      (e.ctrlKey && !e.shiftKey && e.code === 'KeyU');
    if(!blocked) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // ---- 4. debugger loop ----
  // A `debugger` statement does nothing at all while DevTools is closed, so
  // this costs normal visitors nothing; with DevTools open it pauses
  // execution again and again, every 100ms. Built through the Function
  // constructor so each pause lands in a throwaway anonymous script rather
  // than on one fixed line of this file (which could simply be set to
  // "never pause here").
  setInterval(function(){
    try { (function(){}).constructor('debugger')(); } catch(_e){ /* never let this throw into the page */ }
  }, 100);
})();
