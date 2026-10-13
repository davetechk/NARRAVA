// Service worker registration, install popup (Android prompt / iPhone steps)
// and the Profile install button. Shown twice per visit until installed.

if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').catch((err) => {
    console.error('Narrava: service worker registration failed', err);
  });
}

// Per visit only, not saved
let shownInitialThisVisit = false;
let shownAfterWatchThisVisit = false;
let watchedThisVisit = false;
let installedThisVisit = false; // Android 'appinstalled' fired

const pwaModalBackdrop = document.getElementById('pwaModalBackdrop');
const pwaModalBody = document.getElementById('pwaModalBody');
const pwaModalClose = document.getElementById('pwaModalClose');

let deferredInstallEvent = null; // captured beforeinstallprompt, reused by the popup and Profile
let modalVisible = false;

const PWA_SHARE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v10"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/></svg>';

pwaModalClose.addEventListener('click', hideModal);
// Backdrop tap = cancel
pwaModalBackdrop.addEventListener('click', (e) => { if(e.target === pwaModalBackdrop) hideModal(); });

function isStandaloneDisplay(){
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.indexOf('android-app://') === 0;
}

function isIOSDevice(){
  const ua = navigator.userAgent;
  const isIOSUA = /iPad|iPhone|iPod/.test(ua);
  const isIPadOS13Plus = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1; // iPadOS reports as a Mac since 13
  return isIOSUA || isIPadOS13Plus;
}

// Any iPhone/iPad browser can Add to Home Screen, except in-app webviews
function isIOSBrowserThatCanInstall(){
  if(!isIOSDevice()) return false;
  const ua = navigator.userAgent;
  if(!/Safari\//.test(ua)) return false;
  if(/FBAN|FBAV|Instagram|Line\/|MicroMessenger|Twitter|LinkedInApp|Snapchat/.test(ua)) return false;
  return true;
}

const isIOSInstallableNow = isIOSBrowserThatCanInstall();

// Phones only; the desktop view is a preview
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
  deferredInstallEvent = null; // Chrome lets a prompt be used once
  try {
    await evt.prompt();
    await evt.userChoice;
  } catch(err){
    console.error('Narrava: install prompt failed', err);
  }
  notifyInstallAvailabilityChanged();
}

// Install variant, shared by the popup and the Profile button:
// 'installed' | 'prompt' | 'ios' | 'ios-inapp' | 'other'
function installVariant(){
  if(isStandaloneDisplay()) return 'installed';
  if(deferredInstallEvent) return 'prompt';
  if(isIOSInstallableNow) return 'ios';
  if(isIOSDevice()) return 'ios-inapp';
  return 'other';
}

function renderModal(){
  const variant = installVariant();
  let messageHtml;
  let actionsHtml;

  if(variant === 'prompt'){
    messageHtml = '<div class="pwa-modal-message">Tap Install to add Narrava to your home screen.</div>';
    actionsHtml =
      '<button type="button" class="pwa-modal-btn-primary" id="pwaModalInstallBtn">Install</button>' +
      '<button type="button" class="pwa-modal-btn-secondary" id="pwaModalCancelBtn">Cancel</button>';
  } else if(variant === 'ios'){
    messageHtml = '<div class="pwa-modal-message pwa-modal-message-ios">' + PWA_SHARE_ICON + '<span>Tap Share, then "Add to Home Screen"</span></div>';
    actionsHtml = '<button type="button" class="pwa-modal-btn-secondary" id="pwaModalCancelBtn">Cancel</button>';
  } else if(variant === 'installed'){
    messageHtml = '<div class="pwa-modal-message">Narrava is already installed on this device.</div>';
    actionsHtml = '<button type="button" class="pwa-modal-btn-secondary" id="pwaModalCancelBtn">Close</button>';
  } else if(variant === 'ios-inapp'){
    messageHtml = '<div class="pwa-modal-message">Open Narrava in Safari or Chrome first, then tap Share and "Add to Home Screen".</div>';
    actionsHtml = '<button type="button" class="pwa-modal-btn-secondary" id="pwaModalCancelBtn">Close</button>';
  } else {
    messageHtml = '<div class="pwa-modal-message">No one-tap install here. Use your browser menu\u2019s "Install app", or on iPhone tap Share, then "Add to Home Screen".</div>';
    actionsHtml = '<button type="button" class="pwa-modal-btn-secondary" id="pwaModalCancelBtn">Close</button>';
  }

  pwaModalBody.innerHTML =
    '<img class="pwa-modal-icon" src="img/icon-192.png" alt="">' +
    '<div class="pwa-modal-title">Install Narrava</div>' +
    messageHtml +
    '<div class="pwa-modal-actions">' + actionsHtml + '</div>';

  const installBtn = document.getElementById('pwaModalInstallBtn');
  if(installBtn) installBtn.addEventListener('click', () => { hideModal(); triggerInstallPrompt(); });

  document.getElementById('pwaModalCancelBtn').addEventListener('click', hideModal);
}

function showModal(){
  if(modalVisible) return;
  renderModal();
  modalVisible = true;
  pwaModalBackdrop.classList.add('open');
}

// Two chances per visit: normal visit, then back on Home after watching. Never once installed.
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

// Called by watch-progress.js after 3+ seconds watched
window.narravaPwaMarkWatched = function(){ watchedThisVisit = true; };

// Called by showScreen when Home shows (second chance)
function notifyHomeScreenShown(){
  evaluateInstallPrompt();
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // hide Chrome's mini-infobar
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

// Chance 1 (Android waits for beforeinstallprompt)
setTimeout(evaluateInstallPrompt, 1500);

// Profile "How to install" button: same modal, doesn't touch the per-visit flags
window.narravaPwaShowInstallHelp = function(){
  if(modalVisible) return;
  showModal();
};

window.narravaPwaCanInstall = function(){ return !!deferredInstallEvent && !isStandaloneDisplay(); };
window.narravaPwaTriggerInstall = triggerInstallPrompt;
