// shared-utils.js
//
// Small helpers used by both the consumer app (index.html) and every
// admin page (admin/*.html) — one source, included by all of them,
// rather than duplicating either function.

function escapeHtml(str){
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Looks up #toast fresh on every call (rather than caching it once at
// load) since index.html and each admin page have their own #toast
// element in different places in the DOM.
function showToast(msg){
  const toast = document.getElementById('toast');
  if(!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(()=>toast.classList.remove('show'), 2200);
}
