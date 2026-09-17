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

const pwaBanner = document.getElementById('pwaInstallBanner');

let deferredInstallEvent = null; // the real beforeinstallprompt event, captured and reused for both the banner's own button and the Profile screen's
let bannerVisible = false;

const PWA_CLOSE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const PWA_SHARE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v10"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/></svg>';

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

function hideBanner(){
  bannerVisible = false;
  if(pwaBanner) pwaBanner.classList.remove('show');
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

function renderBanner(){
  if(!pwaBanner) return;
  const isAndroidVariant = !!deferredInstallEvent;

  const subHtml = isAndroidVariant
    ? '<div class="pwa-install-sub">Add it to your home screen for faster, full-screen watching.</div>'
    : '<div class="pwa-install-sub">' + PWA_SHARE_ICON + '<span>Tap Share, then "Add to Home Screen"</span></div>';

  const actionHtml = isAndroidVariant
    ? '<button type="button" class="pwa-install-action" id="pwaInstallActionBtn">Install</button>'
    : '';

  pwaBanner.innerHTML =
    '<img class="pwa-install-icon" src="img/icon-192.png" alt="">' +
    '<div class="pwa-install-info">' +
      '<div class="pwa-install-title">Install Narrava</div>' +
      subHtml +
    '</div>' +
    actionHtml +
    '<button type="button" class="pwa-install-close" id="pwaInstallCloseBtn" aria-label="Close">' + PWA_CLOSE_ICON + '</button>';

  const actionBtn = document.getElementById('pwaInstallActionBtn');
  if(actionBtn) actionBtn.addEventListener('click', () => { hideBanner(); triggerInstallPrompt(); });

  // Tapping close only ever dismisses this one banner — the same real
  // timing rules below still decide if/when the other real chance
  // shows later, nothing about that is affected by this tap.
  document.getElementById('pwaInstallCloseBtn').addEventListener('click', hideBanner);
}

function showBanner(){
  if(!pwaBanner || bannerVisible) return;
  renderBanner();
  bannerVisible = true;
  pwaBanner.classList.add('show');
}

// The one real gate for both real chances: never once actually
// installed, never on the desktop preview, and never more than the two
// real moments below — a normal visit (first), and returning to Home
// after genuinely watching part of an episode (second, and last).
function evaluateInstallPrompt(){
  if(bannerVisible) return;
  if(isStandaloneDisplay()) return;
  if(!isMobileWidth()) return;
  if(!canOfferInstallHere()) return;

  if(!localStorage.getItem(LS_INITIAL_SHOWN)){
    localStorage.setItem(LS_INITIAL_SHOWN, '1');
    showBanner();
    return;
  }
  if(localStorage.getItem(LS_SECOND_SHOWN)) return;
  if(!localStorage.getItem(LS_WATCHED_EPISODE)) return;

  localStorage.setItem(LS_SECOND_SHOWN, '1');
  showBanner();
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
  hideBanner();
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
