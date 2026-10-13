// Offline start: feed built from this account's downloads only.
// Reloads into the online app when the connection comes back.

const OFFLINE_RECHECK_MS = 20000;
const SERVER_PROBE_TIMEOUT_MS = 6000;

let reconnectPending = false;
let reconnectChecking = false;

// Started offline (not reloaded yet), or offline right now
function appIsOffline(){
  return appStartedOffline || navigator.onLine === false;
}

// Any answer means reachable
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
      ? 'You have ' + count + ' downloaded episode' + (count === 1 ? '' : 's') + ' you can watch offline.'
      : 'Connect to the internet to watch. Downloads play here offline.') + '</p>' +
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

// Shown over the player while something is playing
function showReconnectBar(){
  const bar = document.createElement('div');
  bar.className = 'reconnect-bar';
  bar.id = 'reconnectBar';
  bar.innerHTML = '<span>You’re back online</span><button type="button" id="reconnectNowBtn">Refresh</button>';
  document.body.appendChild(bar);
  document.getElementById('reconnectNowBtn').addEventListener('click', () => location.reload());
}

// Called on every screen change: finish the switch to online after leaving the player
function onScreenChangedForReconnect(name){
  if(reconnectPending && name !== 'feed' && name !== 'watch') location.reload();
}
