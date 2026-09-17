// pwa-install.js
//
// Real PWA installability: a real service worker registration (required
// before Chrome/Android will ever fire beforeinstallprompt at all), the
// real Android/Chrome install prompt (via that same captured event), and
// real, honest "Add to Home Screen" instructions on iOS Safari specifically
// — Apple genuinely gives no website a way to trigger a real install
// prompt there, so a fake button that did nothing would be worse than
// just being straightforward about the two real steps.
//
// Two real chances, never more: once on a normal visit, and once more
// after actually watching part of an episode and returning to the real
// Home screen — see evaluateInstallPrompt() below. Both live in
// localStorage so they survive reloads but never repeat once already
// used up on this browser.

if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').catch((err) => {
    console.error('Narrava: service worker registration failed', err);
  });
}

const LS_INITIAL_SHOWN = 'narrava_pwa_initial_shown';
const LS_SECOND_SHOWN = 'narrava_pwa_second_shown';
const LS_WATCHED_EPISODE = 'narrava_pwa_watched_episode'; // set by watch-progress.js

const pwaModalBackdrop = document.getElementById('pwaModalBackdrop');
const pwaModalBody = document.getElementById('pwaModalBody');
const pwaModalClose = document.getElementById('pwaModalClose');

let deferredInstallEvent = null; // the real beforeinstallprompt event, captured and reused for both the popup's own button and the Profile screen's
let modalVisible = false;

const PWA_SHARE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v10"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/></svg>';

pwaModalClose.addEventListener('click', hideModal);
// Tapping the dimmed backdrop itself, outside the real card, is the
// same real cancel as the close button — matching every other modal
// in this app (auth/share/username).
pwaModalBackdrop.addEventListener('click', (e) => { if(e.target === pwaModalBackdrop) hideModal(); });

function isStandaloneDisplay(){
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true || // iOS Safari's own real flag once actually installed
    document.referrer.indexOf('android-app://') === 0;
}

function isIOSDevice(){
  const ua = navigator.userAgent;
  const isIOSUA = /iPad|iPhone|iPod/.test(ua);
  const isIPadOS13Plus = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1; // iPadOS reports as a Mac since 13
  return isIOSUA || isIPadOS13Plus;
}

// iOS Safari specifically — not Chrome/Firefox/Edge-on-iOS, which
// identify themselves in the UA (CriOS/FxiOS/EdgiOS/OPiOS) despite all
// running on the same WebKit engine underneath.
function isSafariBrowser(){
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|Chrome|Android/.test(ua);
}

const isIOSSafariNow = isIOSDevice() && isSafariBrowser();

// This feature is scoped to real phones (Android Chrome-family browsers
// + iOS Safari) — the desktop view here is a boxed preview/mockup of
// the phone app, not a real install target, so it's left alone entirely.
function isMobileWidth(){
  return window.matchMedia('(max-width: 899px)').matches;
}

function canOfferInstallHere(){
  return !!deferredInstallEvent || isIOSSafariNow;
}

function notifyInstallAvailabilityChanged(){
  window.dispatchEvent(new Event('narrava:pwa-install-changed'));
}

function hideModal(){
  modalVisible = false;
  pwaModalBackdrop.classList.remove('open');
}

async function triggerInstallPrompt(){
  if(!deferredInstallEvent) return;
  const evt = deferredInstallEvent;
  deferredInstallEvent = null; // Chrome only ever lets a captured prompt be used once regardless
  try {
    await evt.prompt();
    await evt.userChoice;
  } catch(err){
    console.error('Narrava: install prompt failed', err);
  }
  notifyInstallAvailabilityChanged();
}

// A real, large popup centered on screen — not the small Continue
// Watching-style strip this used to (mistakenly) reuse. Android/Chrome
// gets a plain, honest message plus the one real Install action; iOS
// Safari gets the real, clear two-step instructions instead, since
// nothing there can ever trigger a real install by itself. Either way
// there's always a real, clearly labeled Cancel button, on top of the
// real close (✕) in the corner.
function renderModal(){
  const isAndroidVariant = !!deferredInstallEvent;

  const messageHtml = isAndroidVariant
    ? '<div class="pwa-modal-message">Tap Install to add Narrava to your home screen.</div>'
    : '<div class="pwa-modal-message pwa-modal-message-ios">' + PWA_SHARE_ICON + '<span>Tap Share, then "Add to Home Screen"</span></div>';

  const actionsHtml = isAndroidVariant
    ? '<button type="button" class="pwa-modal-btn-primary" id="pwaModalInstallBtn">Install</button>' +
      '<button type="button" class="pwa-modal-btn-secondary" id="pwaModalCancelBtn">Cancel</button>'
    : '<button type="button" class="pwa-modal-btn-secondary" id="pwaModalCancelBtn">Cancel</button>';

  pwaModalBody.innerHTML =
    '<img class="pwa-modal-icon" src="img/icon-192.png" alt="">' +
    '<div class="pwa-modal-title">Install Narrava</div>' +
    messageHtml +
    '<div class="pwa-modal-actions">' + actionsHtml + '</div>';

  const installBtn = document.getElementById('pwaModalInstallBtn');
  if(installBtn) installBtn.addEventListener('click', () => { hideModal(); triggerInstallPrompt(); });

  // Tapping Cancel only ever dismisses this one popup — the same real
  // timing rules below still decide if/when the other real chance
  // shows later, nothing about that is affected by this tap.
  document.getElementById('pwaModalCancelBtn').addEventListener('click', hideModal);
}

function showModal(){
  if(modalVisible) return;
  renderModal();
  modalVisible = true;
  pwaModalBackdrop.classList.add('open');
}

// The one real gate for both real chances: never once actually
// installed, never on the desktop preview, and never more than the two
// real moments below — a normal visit (first), and returning to Home
// after genuinely watching part of an episode (second, and last).
function evaluateInstallPrompt(){
  if(modalVisible) return;
  if(isStandaloneDisplay()) return;
  if(!isMobileWidth()) return;
  if(!canOfferInstallHere()) return;

  if(!localStorage.getItem(LS_INITIAL_SHOWN)){
    localStorage.setItem(LS_INITIAL_SHOWN, '1');
    showModal();
    return;
  }
  if(localStorage.getItem(LS_SECOND_SHOWN)) return;
  if(!localStorage.getItem(LS_WATCHED_EPISODE)) return;

  localStorage.setItem(LS_SECOND_SHOWN, '1');
  showModal();
}

// Called by app.js's showScreen() every time the real Home screen
// becomes the visible one — the only trigger for the second chance.
function notifyHomeScreenShown(){
  evaluateInstallPrompt();
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // suppress Chrome's own mini-infobar — this app's own banner/profile button are the only real triggers
  deferredInstallEvent = e;
  notifyInstallAvailabilityChanged();
  evaluateInstallPrompt();
});

window.addEventListener('appinstalled', () => {
  deferredInstallEvent = null;
  hideModal();
  notifyInstallAvailabilityChanged();
});

// Real per-visit chance #1. On Android/Chrome this only actually shows
// once beforeinstallprompt fires (see the handler above calling this
// same function) — beforeinstallprompt is nearly always asynchronous,
// so this first call typically only matters for iOS Safari, which has
// no such event to wait for.
setTimeout(evaluateInstallPrompt, 1500);

// Public surface for profile.js's own always-available install button —
// only ever real: true/present exactly when a real prompt can actually
// be triggered right now.
window.narravaPwaCanInstall = function(){ return !!deferredInstallEvent && !isStandaloneDisplay(); };
window.narravaPwaTriggerInstall = triggerInstallPrompt;
