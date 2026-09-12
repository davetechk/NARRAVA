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

// Two loading-state variants, already reviewed and picked — see
// loading-animations.html and the matching CSS in styles.css. 'pulse'
// is the general-purpose one (drop it in any content area that's just
// waiting on real data); 'orbit' is specifically for the one genuine
// wait this app has where the on-screen state can lag reality — Bunny
// Stream still processing an episode after upload — used via
// showBunnyProcessingToast below, not meant to be embedded inline like
// 'pulse' is.
function narravaLoaderHtml(variant, label){
  const inner = variant === 'orbit'
    ? '<div class="orbit"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>'
    : '<div class="pulse-ring"></div><div class="pulse-ring delay"></div>';
  return '<div class="narrava-loading-block">' +
    '<div class="narrava-loader narrava-loader-' + variant + '">' +
      inner +
      '<img class="narrava-loader-icon" src="/img/icon-triangle.png" alt="">' +
    '</div>' +
    (label ? '<div class="narrava-loading-label">' + escapeHtml(label) + '</div>' : '') +
  '</div>';
}

// The honest "Bunny is still processing this" notice — a real situation
// this app has (uploaded bytes finish transferring well before Bunny
// itself finishes transcoding them into something playable), shown as
// a small persisting toast with the orbit-dots loader rather than the
// plain showToast() above, since this one deserves to actually be seen
// animating, not just flash by in 2.2s. Looks up #toast's sibling
// container fresh each call, same reasoning as showToast. No fake
// progress or completion signal — it just says what's true and goes
// away on its own.
function showBunnyProcessingToast(msg){
  let el = document.getElementById('bunnyProcessingToast');
  if(!el){
    el = document.createElement('div');
    el.id = 'bunnyProcessingToast';
    el.className = 'narrava-processing-toast';
    document.body.appendChild(el);
  }
  el.innerHTML = narravaLoaderHtml('orbit') + '<div class="narrava-processing-toast-text"></div>';
  el.querySelector('.narrava-processing-toast-text').textContent = msg;
  el.classList.add('show');
  clearTimeout(el.__hideTimer);
  el.__hideTimer = setTimeout(() => el.classList.remove('show'), 6000);
}
