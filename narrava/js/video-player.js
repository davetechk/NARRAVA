// video-player.js
//
// Real native playback engine shared by the mobile feed (app.js) and
// the desktop watch page (watch.js) — replaces Bunny's iframe + their
// player.js entirely, everywhere a video plays. A real <video> element
// plus hls.js (for browsers without native HLS) is the actual player;
// this file only owns the two genuinely shared, non-trivial pieces:
// fetching a real signed playback URL from bunny-signed-playback-url,
// and wiring hls.js to a <video> element against that URL, including
// carrying the real signed auth forward onto every request hls.js
// makes on its own (level playlists, segments — see xhrSetup below),
// and proactively refreshing that auth before its real, short (~10 min,
// confirmed live) expiry window closes so a long episode or a long
// pause never breaks playback partway through.
//
// Everything else (play/pause, currentTime, duration, the 'ended'
// event, scrub-seeking, playback rate) is just the real, direct,
// synchronous <video> element API — callers use it straight, no wrapper
// needed for any of that.

// Called once per real episode a viewer is actually entitled to see.
// Returns {playbackUrl, expiresAt} on success. Returns null on ANY
// refusal — not signed in, or the function's own real "not unlocked"
// check — and that refusal is final: callers must never fall back to
// a different URL or guess a way to play anyway (see app.js/watch.js).
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

// Confirmed live (see the real, redeployed bunny-signed-playback-url):
// the real auth Bunny checks sits in the query string of the master
// playlist URL, but the master's own content only ever references its
// resolution sub-playlists and their real segments by RELATIVE path —
// plain HLS relative-URL resolution drops a base URL's query string,
// so hls.js's own level/fragment requests would silently lose that
// auth unless it's put back on every one of them. Re-attached only
// when a request URL doesn't already carry it (the master's own first
// request already has it from loadSource).
function narravaHlsXhrSetup(getAuthQuery){
  return function(xhr, url){
    if(url.indexOf('token=') === -1){
      const sep = url.indexOf('?') === -1 ? '?' : '&';
      xhr.open('GET', url + sep + getAuthQuery().slice(1), true);
    }
  };
}

// Wires a real episode's real signed HLS stream to a real <video>
// element — used both for the mobile feed's instant-start preloading
// (an off-screen element, moved into place once ready — see app.js)
// and the desktop watch page's single active player (see watch.js).
// Resolves once hls.js has actually parsed the real manifest (or
// immediately, for a browser with native HLS support — Safari — which
// needs no hls.js at all). Returns null if the real signed URL was
// refused (see fetchSignedPlaybackUrl) — callers must treat that
// exactly like a locked episode, never play anything in that case.
//
// The returned controller's only job past setup is keeping the real
// auth fresh for as long as this episode stays active: it reschedules
// itself against each real expiresAt it receives, refetching a new
// signed URL for this same episode and handing hls.js's in-flight
// requests the new auth — playback itself is never interrupted or
// reloaded to do this, since the auth is re-read fresh on every
// request hls.js makes (see narravaHlsXhrSetup), not baked in once.
async function attachEpisodePlayback(videoEl, episodeId){
  const signed = await fetchSignedPlaybackUrl(episodeId);
  if(!signed) return null;

  let authQuery = new URL(signed.playbackUrl).search;
  let refreshTimer = null;
  let destroyed = false;
  const usingNativeHls = !(window.Hls && Hls.isSupported());
  if(usingNativeHls && !videoEl.canPlayType('application/vnd.apple.mpegurl')){
    return null; // genuinely no way to play HLS in this browser
  }

  // Refetches a real signed URL for this same episode and rotates the
  // auth every future request will use — called proactively, ~30s
  // ahead of the real expiry, and also right away if a fragment/level
  // load ever genuinely comes back unauthorized (a real clock race
  // between the proactive timer and Bunny's own expiry), so either
  // path recovers the exact same way. Under hls.js this never touches
  // playback — every future request just reads the rotated auth fresh
  // (see narravaHlsXhrSetup). A browser playing the manifest natively
  // (Safari) has no per-request hook to rotate, so there the real
  // fix is reassigning `src` to the freshly-signed URL — which the
  // browser treats as a real reload, so the exact real currentTime and
  // paused state are captured first and restored once the new source
  // is actually ready, rather than silently restarting the episode.
  async function refreshAuth(){
    if(destroyed) return;
    const fresh = await fetchSignedPlaybackUrl(episodeId);
    if(destroyed || !fresh) return; // episode no longer playable (e.g. lost its unlock) — nothing to recover into
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
    const msUntilExpiry = expiresAt * 1000 - Date.now();
    const delay = Math.max(msUntilExpiry - 30000, 5000);
    refreshTimer = setTimeout(refreshAuth, delay);
  }
  scheduleRefresh(signed.expiresAt);

  let hls = null;
  if(!usingNativeHls){
    hls = new Hls({ xhrSetup: narravaHlsXhrSetup(() => authQuery) });
    hls.on(Hls.Events.ERROR, (_evt, data) => {
      const unauthorized = data && data.response && (data.response.code === 401 || data.response.code === 403);
      if(unauthorized){
        // A real request lost the race against expiry — refresh right
        // now instead of waiting for the proactive timer, then let
        // hls.js's own retry pick the new auth up on its next attempt.
        refreshAuth();
        return;
      }
      if(data && data.fatal){
        switch(data.type){
          case Hls.ErrorTypes.NETWORK_ERROR: hls.startLoad(); break;
          case Hls.ErrorTypes.MEDIA_ERROR: hls.recoverMediaError(); break;
          default: destroy();
        }
      }
    });
    hls.loadSource(signed.playbackUrl);
    hls.attachMedia(videoEl);
  } else {
    // Real native HLS support (Safari/iOS) — no hls.js needed; the
    // browser's own network stack fetches sub-playlists/segments
    // straight from the manifest's relative paths using this same
    // signed URL's query, same as hls.js's first request does.
    videoEl.src = signed.playbackUrl;
  }

  function destroy(){
    if(destroyed) return;
    destroyed = true;
    if(refreshTimer) clearTimeout(refreshTimer);
    if(hls){ hls.destroy(); }
    else { videoEl.removeAttribute('src'); videoEl.load(); }
  }

  return { hls, destroy };
}
