// pwa-install.js
//
// Real PWA installability: a real service worker registration (required
// before Chrome/Android will ever fire beforeinstallprompt at all), the
// real Android/Chrome install prompt (via that same captured event), and
// real, honest "Add to Home Screen" instructions on iPhone, in any real
// browser (Safari, Chrome, Firefox, Edge…) — Apple genuinely gives no
// website a way to trigger a real install prompt there, so a fake button
// that did nothing would be worse than just being straightforward about
// the two real steps.
//
// Two real chances, EVERY visit, until the app is genuinely installed: once
// on a normal visit, and once more after actually watching part of an
// episode and returning to the real Home screen — see
// evaluateInstallPrompt() below. The only thing that ever ends them for
// good is the app actually running installed (isStandaloneDisplay()).
// Closing or cancelling the popup is not "installed": it only dismisses it
// for the rest of that visit. (It used to remember that each chance had
// been shown once, in localStorage, so anyone who closed it a single time
// never saw it again.)

if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').catch((err) => {
    console.error('Narrava: service worker registration failed', err);
  });
}

// Per-visit state only — deliberately NOT persisted. A new page load / app
// open starts them all fresh, so someone who dismissed the popup last time
// and still hasn't installed sees it again. (Old localStorage keys from the
// once-only version, narrava_pwa_*, are simply ignored now.)
let shownInitialThisVisit = false;
let shownAfterWatchThisVisit = false;
let watchedThisVisit = false;
let installedThisVisit = false; // the browser said the install just happened (Android/Chrome 'appinstalled')

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

// Any real browser on an iPhone/iPad can install — not just Safari. Since
// iOS 16.4, Apple lets Chrome, Firefox, Edge and other browsers offer the
// same Share → "Add to Home Screen" path Safari always had, so what
// matters is the device (isIOSDevice above), not which browser is on it.
// The old check required Safari specifically (it ruled out CriOS/FxiOS/
// EdgiOS/OPiOS), which is why the instructions never showed in Chrome on
// iPhone. Two guards remain so the instructions only appear where they can
// actually work: every real iOS browser carries the "Safari/" token in its
// user agent, whereas a webview embedded inside another app (Facebook,
// Instagram, Line, WeChat, …) can't add to the home screen at all — those
// either lack the token or name themselves.
function isIOSBrowserThatCanInstall(){
  if(!isIOSDevice()) return false;
  const ua = navigator.userAgent;
  if(!/Safari\//.test(ua)) return false;
  if(/FBAN|FBAV|Instagram|Line\/|MicroMessenger|Twitter|LinkedInApp|Snapchat/.test(ua)) return false;
  return true;
}

const isIOSInstallableNow = isIOSBrowserThatCanInstall();

// This feature is scoped to real phones (Android Chrome-family browsers
// + iOS Safari) — the desktop view here is a boxed preview/mockup of
// the phone app, not a real install target, so it's left alone entirely.
function isMobileWidth(){
  return window.matchMedia('(max-width: 899px)').matches;
}

function canOfferInstallHere(){
  return !!deferredInstallEvent || isIOSInstallableNow;
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
// nothing there can ever trigger a real install by itself. (iOS gets
// these in every real browser on iPhone, not just Safari.) Either way
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

// The one real gate for both real chances. Popups are suppressed for good
// ONLY when the app is genuinely running installed (standalone display —
// the home-screen app itself, not a browser tab), or, on Android, the
// browser has just reported the install. Everything else — never seen it,
// seen it and closed it, seen it many times — still gets it, at exactly
// two moments per visit: a normal visit (first), and returning to Home
// after genuinely watching part of an episode (second). Never on the
// desktop preview.
function evaluateInstallPrompt(){
  if(modalVisible) return;
  if(installedThisVisit) return;
  if(isStandaloneDisplay()) return;
  if(!isMobileWidth()) return;
  if(!canOfferInstallHere()) return;

  if(!shownInitialThisVisit){
    shownInitialThisVisit = true;
    showModal();
    return;
  }
  if(shownAfterWatchThisVisit) return;
  if(!watchedThisVisit) return;

  shownAfterWatchThisVisit = true;
  showModal();
}

// Called by watch-progress.js once a real 3+ seconds of an episode has
// played this visit.
window.narravaPwaMarkWatched = function(){ watchedThisVisit = true; };

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
  installedThisVisit = true;
  deferredInstallEvent = null;
  hideModal();
  notifyInstallAvailabilityChanged();
});

// Real per-visit chance #1 (every visit until installed). On Android/Chrome this only actually shows
// once beforeinstallprompt fires (see the handler above calling this
// same function) — beforeinstallprompt is nearly always asynchronous,
// so this first call typically only matters for iPhone browsers, which have
// no such event to wait for.
setTimeout(evaluateInstallPrompt, 1500);

// Public surface for profile.js's own always-available install button —
// only ever real: true/present exactly when a real prompt can actually
// be triggered right now.
window.narravaPwaCanInstall = function(){ return !!deferredInstallEvent && !isStandaloneDisplay(); };
window.narravaPwaTriggerInstall = triggerInstallPrompt;
