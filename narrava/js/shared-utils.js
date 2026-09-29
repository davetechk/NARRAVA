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

// "6 months ago" style relative time, for real timestamps (comments,
// replies) — not a fabricated freshness signal, just a friendlier
// rendering of a real created_at.
function timeAgo(iso){
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  const units = [
    ['year', 31536000], ['month', 2592000], ['week', 604800],
    ['day', 86400], ['hour', 3600], ['minute', 60]
  ];
  for(let i = 0; i < units.length; i++){
    const val = Math.floor(diffSec / units[i][1]);
    if(val >= 1) return val + ' ' + units[i][0] + (val === 1 ? '' : 's') + ' ago';
  }
  return 'just now';
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

// ================= Real sharing =================
//
// The one real share mechanism for a series — used by both the mobile
// feed's shareBtn (app.js) and the desktop watch page's watchShareBtn
// (watch.js), never a second implementation. navigator.share is the
// browser's own real native share sheet (confirmed available on mobile
// Chrome/Safari; genuinely absent on most desktop browsers, which is
// exactly when the fallback below is needed, not a bug).
//
// Each series has its own real link: this same page plus a
// "#series=<series id>" fragment (seriesShareUrl below). The fragment —
// not a query string or a path — is deliberate: index.html is a single
// static page with no server-side routing, a fragment never reaches the
// server, and sw.js never sees it, so it needs no hosting or
// service-worker changes. app.js's openDeepLinkedSeries reads it
// (seriesIdFromLocationHash) and opens straight into that series. The
// link only says *which series* — it carries no episode and no unlock
// state, so it can't be used to get around a lock: the recipient's app
// applies the normal lock rule (free_episode_count / Free Mode) itself.
//
// #shareSheetBackdrop only exists on index.html, not the admin pages
// that also load this file — every lookup below is guarded so this
// still loads cleanly there.
const shareSheetBackdrop = document.getElementById('shareSheetBackdrop');
let pendingShareData = null;

function openShareFallback(shareData){
  if(!shareSheetBackdrop) return;
  pendingShareData = shareData;
  shareSheetBackdrop.classList.add('open');
}
function closeShareFallback(){
  if(!shareSheetBackdrop) return;
  shareSheetBackdrop.classList.remove('open');
  pendingShareData = null;
}

if(shareSheetBackdrop){
  const shareSheetClose = document.getElementById('shareSheetClose');
  const shareCopyLinkBtn = document.getElementById('shareCopyLinkBtn');
  const shareWhatsAppBtn = document.getElementById('shareWhatsAppBtn');
  const shareFacebookBtn = document.getElementById('shareFacebookBtn');

  shareSheetClose.addEventListener('click', closeShareFallback);
  shareSheetBackdrop.addEventListener('click', e => { if(e.target === shareSheetBackdrop) closeShareFallback(); });

  // Real, working destinations only — a real clipboard write of this
  // real page's own URL, and WhatsApp's/Facebook's own real
  // no-login-required share endpoints. Never a platform icon with no
  // real link handoff behind it (that's worse than not offering it).
  shareCopyLinkBtn.addEventListener('click', async () => {
    if(!pendingShareData) return;
    try {
      await navigator.clipboard.writeText(pendingShareData.url);
      showToast('Link copied');
    } catch(err){
      console.error('Narrava: failed to copy share link', err);
      showToast('Could not copy link — please try again');
    }
    closeShareFallback();
  });
  shareWhatsAppBtn.addEventListener('click', () => {
    if(!pendingShareData) return;
    const text = pendingShareData.text + ' ' + pendingShareData.url;
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
    closeShareFallback();
  });
  shareFacebookBtn.addEventListener('click', () => {
    if(!pendingShareData) return;
    window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(pendingShareData.url), '_blank', 'noopener');
    closeShareFallback();
  });
}

// The one place the link format is defined — build (seriesShareUrl) and
// parse (seriesIdFromLocationHash) live side by side so they can't drift.
// Built from origin + pathname only, so it works wherever the app is
// hosted (root or a subfolder) and never carries along unrelated query
// strings or a fragment from the current page.
function seriesShareUrl(seriesId){
  return window.location.origin + window.location.pathname + '#series=' + encodeURIComponent(seriesId);
}

// Returns the series id in the current URL's fragment, or null if there
// isn't one (or it's malformed).
function seriesIdFromLocationHash(){
  const match = /^#series=([^&]+)/.exec(window.location.hash);
  if(!match) return null;
  try { return decodeURIComponent(match[1]); } catch(_err){ return null; }
}

// Called with the real series the viewer is looking at. Tries the real
// native share sheet first; AbortError (the viewer closed it themselves)
// is not a failure worth logging. Falls back to the popup above only when
// navigator.share itself genuinely doesn't exist.
async function shareSeries(title, seriesId){
  const shareData = {
    title: 'Narrava',
    text: 'Check out "' + title + '" on Narrava!',
    url: seriesShareUrl(seriesId)
  };
  if(navigator.share){
    try {
      await navigator.share(shareData);
    } catch(err){
      if(err && err.name !== 'AbortError') console.error('Narrava: native share failed', err);
    }
    return;
  }
  openShareFallback(shareData);
}

// Narrava's real triangle logo (narrava/img/narrava-mark.svg) — a clean
// single-path vector, not a trace, fill="currentColor" so CSS
// (.narrava-mark-icon) picks the color instead of it being baked into
// the markup. Used for every copy of the mark narravaLoaderHtml() draws:
// the center icon and, now that the pulse rings are triangle-shaped
// instead of plain squares, the copy inside each .pulse-ring too.
const NARRAVA_MARK_SVG = '<svg viewBox="0 0 428 452" class="narrava-mark-icon" fill="currentColor"><path d="M 0,56 L 0,396 A 56,56 0 0 0 49.5,425.9 L 415.6,232.5 A 14,14 0 0 0 415.6,219.5 L 49.5,26.1 A 56,56 0 0 0 0,56 Z"/></svg>';

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
    : '<div class="pulse-ring">' + NARRAVA_MARK_SVG + '</div><div class="pulse-ring delay">' + NARRAVA_MARK_SVG + '</div>';
  return '<div class="narrava-loading-block">' +
    '<div class="narrava-loader narrava-loader-' + variant + '">' +
      inner +
      NARRAVA_MARK_SVG +
    '</div>' +
    (label ? '<div class="narrava-loading-label">' + escapeHtml(label) + '</div>' : '') +
  '</div>';
}

// The honest state for a real, permanently failed load — every real
// bounded retry (video-player.js's attachEpisodePlayback) has already
// been exhausted by the time this ever gets shown, never guessed at
// early. retryBtnId is the caller's own id to attach a real click
// handler to (app.js/watch.js each wire their own — this only ever
// builds the shared markup, never the retry behavior itself, which
// differs per caller: re-running preloadVideo vs. watchPlayEpisode).
function narravaLoadFailedHtml(retryBtnId){
  return '<div class="narrava-loading-block">' +
    '<div class="narrava-load-failed-text">Couldn’t load this episode</div>' +
    '<button type="button" class="pill-cta-btn" id="' + retryBtnId + '">Try again</button>' +
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
