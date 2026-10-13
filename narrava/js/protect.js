// Copy and DevTools deterrents (consumer app only). Not security.
// Dev escape: localStorage.narrava_devtools_ok = '1', then reload.

(function(){
  var devBypass = false;
  try { devBypass = localStorage.getItem('narrava_devtools_ok') === '1'; } catch(_e){ /* storage blocked — deterrents stay on */ }
  if(devBypass) return;

  // Scopes the user-select:none CSS to the consumer app
  document.documentElement.classList.add('protected');

  // Text fields stay usable
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
  // Matched on e.code so keyboard layout doesn't matter
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
  // Pauses only while DevTools is open; Function() so it can't be set to "never pause here"
  setInterval(function(){
    try { (function(){}).constructor('debugger')(); } catch(_e){ }
  }, 100);
})();
