// Playback shared by the feed and the watch page: signed URL, hls.js wiring,
// auth refresh before expiry, bounded retries, view counting
const MAX_LOAD_RETRIES = 3;
const RETRY_BACKOFF_MS = [1000, 2000, 4000];

// {playbackUrl, expiresAt}, or null on any refusal (never fall back to another URL)
async function fetchSignedPlaybackUrl(episodeId){
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const accessToken = sessionData && sessionData.session ? sessionData.session.access_token : null;
  if(!accessToken) return null;

  let res;
  try {
    res = await fetch(SUPABASE_URL + '/functions/v1/bunny-signed-playback-url', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ episodeId })
    });
  } catch(_networkErr){
    return null;
  }
  if(!res.ok) return null;

  let data;
  try { data = await res.json(); } catch(_parseErr){ return null; }
  if(!data || !data.playbackUrl) return null;
  return { playbackUrl: data.playbackUrl, expiresAt: data.expiresAt };
}

// Re-attach the signed query to hls.js's relative playlist/segment requests
function narravaHlsXhrSetup(getAuthQuery){
  return function(xhr, url){
    if(url.indexOf('token=') === -1){
      xhr.open('GET', bunnyAuthorizedUrl(url, getAuthQuery()), true);
    }
  };
}

// url with the signed query, unless it already has a token
function bunnyAuthorizedUrl(url, authQuery){
  if(url.indexOf('token=') !== -1 || !authQuery) return url;
  const sep = url.indexOf('?') === -1 ? '?' : '&';
  return url + sep + authQuery.replace(/^\?/, '');
}

// Attach an episode to a <video>. null if refused (treat as locked).
// Downloaded episodes play from the device. onFailure fires once, after all retries.
async function attachEpisodePlayback(videoEl, episodeId, onFailure){
  const localUrl = await localPlaybackUrl(episodeId); // null unless this account downloaded it
  const isLocal = !!localUrl;
  const signed = isLocal ? { playbackUrl: localUrl, expiresAt: null } : await fetchSignedPlaybackUrl(episodeId);
  if(!signed) return null;

  let authQuery = isLocal ? '' : new URL(signed.playbackUrl).search;
  let refreshTimer = null;
  let retryTimer = null;
  let destroyed = false;
  let networkRetries = 0;
  let mediaRetries = 0;
  let nativeRetries = 0;
  const usingNativeHls = !(window.Hls && Hls.isSupported());
  if(usingNativeHls && !videoEl.canPlayType('application/vnd.apple.mpegurl')){
    return null; // no HLS support
  }

  // New signed URL ~30s before expiry, or on a 401/403.
  // Safari: reassign src and restore time/paused state.
  async function refreshAuth(){
    if(destroyed || isLocal) return;
    const fresh = await fetchSignedPlaybackUrl(episodeId);
    if(destroyed || !fresh) return; // no longer playable
    authQuery = new URL(fresh.playbackUrl).search;
    scheduleRefresh(fresh.expiresAt);
    if(usingNativeHls){
      const resumeAt = videoEl.currentTime;
      const wasPaused = videoEl.paused;
      videoEl.src = fresh.playbackUrl;
      videoEl.addEventListener('loadedmetadata', function onReady(){
        videoEl.removeEventListener('loadedmetadata', onReady);
        videoEl.currentTime = resumeAt;
        if(!wasPaused) videoEl.play();
      });
    }
  }

  function scheduleRefresh(expiresAt){
    if(refreshTimer) clearTimeout(refreshTimer);
    if(isLocal) return;
    const msUntilExpiry = expiresAt * 1000 - Date.now();
    const delay = Math.max(msUntilExpiry - 30000, 5000);
    refreshTimer = setTimeout(refreshAuth, delay);
  }
  scheduleRefresh(signed.expiresAt);

  // All retries used: fire onFailure once and tear down
  function failPermanently(){
    if(destroyed) return;
    destroy();
    if(onFailure) onFailure();
  }

  let hls = null;
  let onNativeVideoError = null;
  if(!usingNativeHls){
    hls = new Hls(isLocal ? {} : { xhrSetup: narravaHlsXhrSetup(() => authQuery) });
    hls.on(Hls.Events.ERROR, (_evt, data) => {
      const unauthorized = !isLocal && data && data.response && (data.response.code === 401 || data.response.code === 403);
      if(unauthorized){
        // Lost the race against expiry: refresh now
        refreshAuth();
        return;
      }
      if(!(data && data.fatal)) return;

      switch(data.type){
        case Hls.ErrorTypes.NETWORK_ERROR: {
          if(networkRetries >= MAX_LOAD_RETRIES){ failPermanently(); return; }
          const delay = RETRY_BACKOFF_MS[Math.min(networkRetries, RETRY_BACKOFF_MS.length - 1)];
          networkRetries++;
          retryTimer = setTimeout(() => {
            if(destroyed) return;
            // Manifest-stage failure: startLoad() can't recover it, reload the manifest
            if(data.details && data.details.indexOf('manifestLoad') === 0){
              hls.loadSource(signed.playbackUrl);
            } else {
              hls.startLoad();
            }
          }, delay);
          break;
        }
        case Hls.ErrorTypes.MEDIA_ERROR: {
          if(mediaRetries >= MAX_LOAD_RETRIES){ failPermanently(); return; }
          const delay = RETRY_BACKOFF_MS[Math.min(mediaRetries, RETRY_BACKOFF_MS.length - 1)];
          mediaRetries++;
          retryTimer = setTimeout(() => { if(!destroyed) hls.recoverMediaError(); }, delay);
          break;
        }
        default:
          failPermanently();
      }
    });
    hls.loadSource(signed.playbackUrl);
    hls.attachMedia(videoEl);
  } else {
    // Native HLS (Safari): same retry and backoff
    onNativeVideoError = () => {
      if(destroyed) return;
      if(nativeRetries >= MAX_LOAD_RETRIES){ failPermanently(); return; }
      const delay = RETRY_BACKOFF_MS[Math.min(nativeRetries, RETRY_BACKOFF_MS.length - 1)];
      nativeRetries++;
      retryTimer = setTimeout(() => { if(!destroyed) videoEl.src = signed.playbackUrl; }, delay);
    };
    videoEl.addEventListener('error', onNativeVideoError);
    videoEl.src = signed.playbackUrl;
  }

  function destroy(){
    if(destroyed) return;
    destroyed = true;
    if(refreshTimer) clearTimeout(refreshTimer);
    if(retryTimer) clearTimeout(retryTimer);
    if(hls){ hls.destroy(); }
    else {
      if(onNativeVideoError) videoEl.removeEventListener('error', onNativeVideoError);
      videoEl.removeAttribute('src'); videoEl.load();
    }
  }

  return { hls, destroy, isLocal };
}

// ================= Episode views =================
// One view per episode per page session, after 3s of real playback
const viewedEpisodeIds = new Set();

function recordEpisodeViewOnce(episodeId){
  if(!episodeId || viewedEpisodeIds.has(episodeId)) return;
  viewedEpisodeIds.add(episodeId);
  supabaseClient.rpc('record_episode_view', { p_episode_id: episodeId })
    .then(({ error }) => { if(error) console.error('Narrava: failed to record episode view', error); })
    .catch(err => console.error('Narrava: failed to record episode view', err));
}

// Counts only forward playback while playing (jumps > 1.5s are seeks).
// getEpisodeId returns falsy when this video isn't the active one.
function attachViewTracking(video, getEpisodeId){
  let accumulated = 0;
  let lastTime = video.currentTime;

  const resetBaseline = () => { lastTime = video.currentTime; };
  video.addEventListener('seeking', resetBaseline);
  video.addEventListener('playing', resetBaseline);

  video.addEventListener('timeupdate', () => {
    const episodeId = getEpisodeId();
    if(!episodeId){ lastTime = video.currentTime; return; }
    if(video.paused || video.seeking){ lastTime = video.currentTime; return; }
    const dt = video.currentTime - lastTime;
    lastTime = video.currentTime;
    if(dt <= 0 || dt > 1.5) return; // a seek
    accumulated += dt;
    if(accumulated >= 3) recordEpisodeViewOnce(episodeId);
  });
}
