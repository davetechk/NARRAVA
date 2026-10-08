// offline.js
//
// Opening the app with no connection. Normally the app needs the server
// to start (settings, a session, the series list). When loadAppSettings
// (app.js) finds the device offline — navigator.onLine is false, or the
// settings request failed and the server can't be reached at all — it
// sets appStartedOffline, and init() calls startOfflineMode() instead of
// the normal start:
//   - no anonymous sign-in, no coins/subscription/progress requests;
//   - the feed is built only from downloaded episodes (downloads.js), so
//     they play in the normal player, from the device;
//   - Home shows "You're offline" with a button to Downloads.
// sw.js keeps the app's own files and the two CDN libraries (supabase-js,
// hls.js) cached, which is what lets the page load at all offline.
//
// When the connection comes back (the browser's 'online' event, plus a
// slow check in case that event never fires), the app reloads into the
// normal online start — straight away if nothing is playing, otherwise
// as soon as the person leaves the player, with a bar offering to do it
// now.

const OFFLINE_RECHECK_MS = 20000;
const SERVER_PROBE_TIMEOUT_MS = 6000;

let reconnectPending = false;
let reconnectChecking = false;

// True when the app started offline and hasn't reloaded yet, or the
// browser says the device is offline right now.
function appIsOffline(){
  return appStartedOffline || navigator.onLine === false;
}

// Can the server be reached at all? An opaque request: any answer means
// yes, a network failure (or no answer in time) means no.
async function serverReachable(){
  try {
    await withTimeout(fetch(SUPABASE_URL + '/auth/v1/health', { mode: 'no-cors', cache: 'no-store' }), SERVER_PROBE_TIMEOUT_MS);
    return true;
  } catch(_err){
    return false;
  }
}

async function startOfflineMode(){
  document.body.classList.add('app-offline');
  await downloadsReady;

  const seriesIds = [...new Set([...downloadedRecords.values()].map(r => r.seriesId))];
  slides = seriesIds.map(buildDownloadedSeriesSlide).filter(Boolean)
    .sort((a, b) => a.title.localeCompare(b.title));
  slidesLoaded = true;
  pager.innerHTML = slides.map((_, i) => '<div class="pdot ' + (i === 0 ? 'active' : '') + '" data-i="' + i + '"></div>').join('');
  render();
  renderOfflineHome();
  resolveSlidesReady();
  resolveContinueWatchingReady();

  window.addEventListener('online', checkConnectionBack);
  setInterval(checkConnectionBack, OFFLINE_RECHECK_MS);
}

function renderOfflineHome(){
  let el = document.getElementById('offlineHome');
  if(!el){
    el = document.createElement('div');
    el.id = 'offlineHome';
    el.className = 'offline-home';
    discoverScreen.insertBefore(el, discoverScreen.firstChild);
  }
  const count = downloadedRecords.size;
  el.innerHTML =
    '<div class="offline-home-icon">' + DOWNLOAD_ICONS.offline + '</div>' +
    '<h2 class="offline-home-title">You’re offline</h2>' +
    '<p class="offline-home-text">' + (count
      ? 'You have ' + count + ' downloaded episode' + (count === 1 ? '' : 's') + ' you can watch without a connection.'
      : 'Connect to the internet to watch Narrava. Episodes you download play here without a connection.') + '</p>' +
    '<button type="button" class="pill-cta-btn" id="offlineHomeDownloadsBtn">Go to Downloads</button>';
  document.getElementById('offlineHomeDownloadsBtn').addEventListener('click', openDownloadsScreen);
}
document.addEventListener('narrava:downloads-changed', () => {
  if(appStartedOffline && document.getElementById('offlineHome')) renderOfflineHome();
});

function somethingIsPlaying(){
  return (activeScreenName === 'feed' && !!currentVideoEl) || (activeScreenName === 'watch' && !!watchVideoEl);
}

async function checkConnectionBack(){
  if(!appStartedOffline || reconnectChecking || navigator.onLine === false) return;
  reconnectChecking = true;
  const back = await serverReachable();
  reconnectChecking = false;
  if(!back) return;
  if(!somethingIsPlaying()){ location.reload(); return; }
  if(!reconnectPending){
    reconnectPending = true;
    showReconnectBar();
  }
}

// Shown over the player while something is still playing.
function showReconnectBar(){
  const bar = document.createElement('div');
  bar.className = 'reconnect-bar';
  bar.id = 'reconnectBar';
  bar.innerHTML = '<span>You’re back online</span><button type="button" id="reconnectNowBtn">Refresh</button>';
  document.body.appendChild(bar);
  document.getElementById('reconnectNowBtn').addEventListener('click', () => location.reload());
}

// showScreen (app.js) calls this on every screen change: leaving the
// player after the connection came back finishes the switch to online.
function onScreenChangedForReconnect(name){
  if(reconnectPending && name !== 'feed' && name !== 'watch') location.reload();
}
