// watch.js
//
// Desktop-only "watch" screen for a single series. Rebuilt against real
// measurements taken directly off a live reelshort.com episode page
// (loaded in the browser, not recalled from memory):
//   - back button: 64px circle, top-left at (30,110) on a 1920px window
//   - info column: a literal fixed 480px-wide panel, right-aligned,
//     that scrolls internally on its own (h-full w-480px overflow-y-auto)
//     while the video and back button stay fixed
//   - video: not boxed small — its column is flex:1 and the video fills
//     the full available height (855px of a 935px-tall viewport there)
//   - breadcrumb "Home / Series / Episode N" sits right above the H1
//     (font-size 20px/700), itself right below the breadcrumb
//   - like/bookmark/share sit in one centered row with real counts on
//     the real site — Like now shows a real count too (series_likes via
//     get_series_like_count, see social.js); bookmark/share stay
//     icon+label only, same honesty rule as ever (saves have no public
//     count, share isn't wired to anything real)
//   - the episode grid is 6 columns of ~62x46 cells, grouped into range
//     tabs ("0-49", "50-63", "All Episodes") once there are enough
//     episodes to need it — a 2-3 episode series never shows this
//
// Opened instead of the mobile swipe feed when a series is opened from
// the desktop layout — see openSeriesInFeed in app.js, which is the one
// place that decides which screen a poster/hero/search-result click
// lands on.
//
// The video itself reuses the exact same real signed-URL + hls.js engine
// app.js's mobile feed uses (attachEpisodePlayback, video-player.js) on a
// real native <video> element — no preload/promote machinery here, since
// that exists only for the feed's swipe-and-autoplay-instantly behaviour
// and has no purpose on a page that plays one chosen episode at a time.

const WATCH_RANGE_SIZE = 30;

let watchSlide = null;
let watchEpisodes = [];
let watchActiveEpisodeId = null;
let watchActiveRange = 0; // index into the RANGE_SIZE-sized chunks of watchEpisodes
let watchVideoEl = null;     // the real, active <video> element, or null
let watchPlaybackCtl = null; // its attachEpisodePlayback() controller (video-player.js) — .destroy() tears the real playback down

let watchScrubbing = false; // true while the viewer is actively dragging watchScrubRange — see app.js's identical `scrubbing` for why

// Real tap-to-pause / press-and-hold-to-2x on the video itself — same
// real gesture as the mobile feed (app.js), confirmed directly against
// reelshort.com; see app.js's HOLD_SPEED/TAP_MAX_MS comment for what
// was actually confirmed there versus a reasonable default. Desktop had
// no play/pause affordance on the video at all before this — real
// native controls stay off (video.controls = false, watchPlayEpisode),
// so this is now the one real way to pause here, same as reelshort's
// own click-to-pause.
const WATCH_HOLD_SPEED = 2;
const WATCH_TAP_MAX_MS = 200;
let watchPressStartTime = 0;
let watchPressHolding = false;

const watchBackBtn = document.getElementById('watchBackBtn');
const watchPlayerBox = document.getElementById('watchPlayerBox');
const watchPlayerHost = document.getElementById('watchPlayerHost');
const watchScrubRange = document.getElementById('watchScrubRange');
const watchBreadcrumbEl = document.getElementById('watchBreadcrumb');
const watchTitleEl = document.getElementById('watchTitle');
const watchTagsEl = document.getElementById('watchTags');
const watchLikeBtn = document.getElementById('watchLikeBtn');
const watchLikeCount = document.getElementById('watchLikeCount');
const watchSaveBtn = document.getElementById('watchSaveBtn');
const watchShareBtn = document.getElementById('watchShareBtn');
const watchCommentBtn = document.getElementById('watchCommentBtn');
const watchCommentCount = document.getElementById('watchCommentCount');
const watchCommentsBackdrop = document.getElementById('watchCommentsBackdrop');
const watchCommentsClose = document.getElementById('watchCommentsClose');
const watchCommentsBody = document.getElementById('watchCommentsBody');
const watchEpRangesEl = document.getElementById('watchEpRanges');
const watchEpisodeGrid = document.getElementById('watchEpisodeGrid');

// Same reasoning as app.js's destroyActivePlayback/stopFeedPlayback:
// leaving this screen for any other one must actually tear the real
// video down — real hls.js resources (its segment-loading loop, the
// scheduled auth-refresh timer), not just the DOM element — called from
// showScreen() whenever the target screen isn't 'watch'.
function stopWatchPlayback(){
  saveCurrentWatchProgress();
  if(watchPlaybackCtl) watchPlaybackCtl.destroy();
  watchPlayerHost.innerHTML = '';
  watchPlayerBox.classList.remove('has-video', 'paused');
  watchVideoEl = null;
  watchPlaybackCtl = null;
  watchActiveEpisodeId = null;
  closeWatchComments();
}

// Reads the real position straight off the real <video> element (never
// assumed/estimated) and upserts it via watch-progress.js. No-ops
// quietly if nothing is playing right now, or if nobody's signed in
// (saveWatchProgress's own job). Called periodically, on pause, and
// whenever this screen leaves the current episode (stopWatchPlayback,
// switching episodes).
function saveCurrentWatchProgress(){
  if(!watchVideoEl || !watchActiveEpisodeId || !watchSlide) return;
  saveWatchProgress(watchActiveEpisodeId, watchSlide.id, watchVideoEl.currentTime);
}

// Same 15s cadence as the mobile feed (app.js) — frequent enough that a
// refresh/crash never loses more than a few seconds of real progress.
setInterval(saveCurrentWatchProgress, 15000);

// The honest failure state in watchPlayerHost — real retry button wired
// to genuinely redo the whole load (watchPlayEpisode again, from
// scratch, same ep/resumeSeconds — not just re-showing a spinner over
// the same dead attempt).
function showWatchLoadFailure(ep, resumeSeconds){
  watchPlayerHost.innerHTML = '<div class="watch-player-loading">' + narravaLoadFailedHtml('watchPlayerRetryBtn') + '</div>';
  document.getElementById('watchPlayerRetryBtn').addEventListener('click', () => watchPlayEpisode(ep, resumeSeconds));
}

// resumeSeconds, when given, seeks to that exact real position — a
// real, direct, synchronous currentTime assignment once the real video
// is actually ready (loadedmetadata), no polling needed.
async function watchPlayEpisode(ep, resumeSeconds){
  if(!ep || !ep.bunny_video_id) return;
  saveCurrentWatchProgress();
  if(watchPlaybackCtl) watchPlaybackCtl.destroy();

  const episodeId = ep.id;
  watchActiveEpisodeId = episodeId;
  watchVideoEl = null;
  watchPlaybackCtl = null;
  watchPlayerBox.classList.remove('has-video', 'paused');

  const video = document.createElement('video');
  video.controls = false;
  video.playsInline = true;
  video.style.display = 'none';
  // Real loading state instead of a blank/still-loading video for the
  // real wait until the real signed URL/hls.js setup actually resolves —
  // the video already starts loading underneath it (added to the DOM
  // right away, just not shown), so this never adds any extra delay of
  // its own, only replaces what was on screen during a wait that was
  // already happening.
  watchPlayerHost.innerHTML = '<div class="watch-player-loading">' + narravaLoaderHtml('pulse') + '</div>';
  watchPlayerHost.appendChild(video);

  // The breadcrumb, heading and grid highlight are per-episode (the
  // real site's own heading is literally "Episode N - <title>"), and
  // update immediately — same as before — rather than waiting on the
  // real signed URL/hls.js setup below, since they're honest the moment
  // this episode is genuinely the one being switched to, not only once
  // its video is actually playing.
  watchBreadcrumbEl.innerHTML = 'Home / ' + escapeWatchHtml(watchSlide.title) + ' / <span>Episode ' + ep.episode_number + '</span>';
  watchTitleEl.textContent = ep.title ? ('Ep ' + ep.episode_number + ': ' + ep.title) : ('Episode ' + ep.episode_number);
  renderWatchEpisodes();

  const ctl = await attachEpisodePlayback(video, episodeId, () => {
    // Every real bounded retry (video-player.js) has now genuinely been
    // exhausted — confirmed live: before this existed, nothing here ever
    // learned the load had failed, so watchPlayerHost just sat on its
    // loading spinner forever, over a <video> that was already dead.
    if(watchActiveEpisodeId !== episodeId) return; // navigated away before this fired
    showWatchLoadFailure(ep, resumeSeconds);
  });
  if(watchActiveEpisodeId !== episodeId) { if(ctl) ctl.destroy(); return; } // navigated away before this resolved
  if(!ctl){
    // The function's own real refusal (see video-player.js) — never
    // fall back to anything else, just leave the real loading state
    // showing rather than fake a working player.
    return;
  }
  watchVideoEl = video;
  watchPlaybackCtl = ctl;
  watchScrubRange.value = video.currentTime || 0;
  // Same defensive read as app.js's attachPlaybackControls: if metadata
  // somehow already loaded by the time this runs, don't wait on an
  // event that's already fired and will never fire again.
  watchScrubRange.max = (video.duration && isFinite(video.duration)) ? video.duration : 0;
  watchScrubRange.style.setProperty('--scrub-pct', '0%');

  video.addEventListener('canplay', function onCanPlay(){
    video.removeEventListener('canplay', onCanPlay);
    if(watchActiveEpisodeId !== episodeId) return;
    const loadingEl = watchPlayerHost.querySelector('.watch-player-loading');
    if(loadingEl) loadingEl.remove();
    video.style.display = '';
    watchPlayerBox.classList.add('has-video');
    if(resumeSeconds && resumeSeconds > 0.5) video.currentTime = resumeSeconds;
    video.play().catch(() => {});
  }, { once: true });
  video.addEventListener('loadedmetadata', () => {
    if(watchVideoEl !== video) return;
    watchScrubRange.max = video.duration || 0;
  });
  video.addEventListener('timeupdate', () => {
    if(watchVideoEl !== video || watchScrubbing) return;
    watchScrubRange.value = video.currentTime;
    const pct = video.duration ? (video.currentTime / video.duration) * 100 : 0;
    watchScrubRange.style.setProperty('--scrub-pct', pct + '%');
  });
  video.addEventListener('pause', () => {
    if(watchVideoEl !== video) return;
    saveCurrentWatchProgress();
    watchPlayerBox.classList.add('paused');
  });
  video.addEventListener('play', () => {
    if(watchVideoEl !== video) return;
    watchPlayerBox.classList.remove('paused');
  });
}

function escapeWatchHtml(s){
  return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Real free_episode_count from the series row (see feed-data.js) — an
// episode past it is locked, exactly like the mobile poster grid's VIP
// tab lock icon. Missing/null (a legacy row) falls back to 0 rather than
// guessing, so nothing gets treated as unlocked that isn't really known
// to be.
function watchFreeCount(){
  return (watchSlide && typeof watchSlide.freeEpisodeCount === 'number') ? watchSlide.freeEpisodeCount : 0;
}

function watchEpCardHtml(ep, locked){
  const isActive = ep.id === watchActiveEpisodeId;
  // Matches the real site exactly (checked directly): the episode
  // number stays visible even when locked — a small lock badge overlays
  // the corner, it doesn't replace the number.
  const lockBadge = locked
    ? '<svg class="watch-ep-card-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>'
    : '';
  return '<button type="button" class="watch-ep-card' + (isActive ? ' active' : '') + (locked ? ' locked' : '') +
    '" data-ep-id="' + ep.id + '"' + (locked ? ' disabled' : '') + '>' +
    lockBadge + ep.episode_number +
  '</button>';
}

// Range tabs only appear once a series actually has enough episodes to
// need grouping — matching the real site's own behaviour (it groups
// "0-49" / "50-63" for a 63-episode series, but a short series there
// just shows one plain grid, no tabs). Every Narrava series today has
// 2-3 real episodes, so this is realistically dormant, but the
// mechanism is real and will kick in the moment a series legitimately
// has more than WATCH_RANGE_SIZE episodes.
function renderWatchRanges(){
  if(watchEpisodes.length <= WATCH_RANGE_SIZE){
    watchEpRangesEl.innerHTML = '';
    return;
  }
  const rangeCount = Math.ceil(watchEpisodes.length / WATCH_RANGE_SIZE);
  let html = '';
  for(let i = 0; i < rangeCount; i++){
    const start = i * WATCH_RANGE_SIZE + 1;
    const end = Math.min((i + 1) * WATCH_RANGE_SIZE, watchEpisodes.length);
    html += '<button type="button" class="watch-range-tab' + (i === watchActiveRange ? ' active' : '') + '" data-range="' + i + '">' + start + '-' + end + '</button>';
  }
  watchEpRangesEl.innerHTML = html;
  watchEpRangesEl.querySelectorAll('.watch-range-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      watchActiveRange = parseInt(btn.dataset.range, 10);
      renderWatchEpisodes();
    });
  });
}

function renderWatchEpisodes(){
  renderWatchRanges();

  const freeCount = watchFreeCount();
  // Free Mode (app_settings, see app.js's appSettings) overrides this
  // series' own real free_episode_count the exact same way the mobile
  // feed's isEpisodeLocked does — nothing locked, full stop, the real
  // per-series count itself untouched either way.
  const freeModeOn = appSettings.free_mode_enabled;
  const start = watchActiveRange * WATCH_RANGE_SIZE;
  const visible = watchEpisodes.slice(start, start + WATCH_RANGE_SIZE);

  watchEpisodeGrid.innerHTML = visible
    .map(ep => watchEpCardHtml(ep, !freeModeOn && ep.episode_number > freeCount))
    .join('');
  watchEpisodeGrid.querySelectorAll('.watch-ep-card:not(.locked)').forEach(btn => {
    btn.addEventListener('click', () => watchPlayEpisode(watchEpisodes.find(e => e.id === btn.dataset.epId)));
  });
}

// slideIndex is `slides`' own index, same as every other openSeriesInFeed
// caller already passes in. `resume`, when given ({episodeId,
// positionSeconds}), is Continue Watching's jump-back-in — it plays that
// exact episode (falling back to the first episode if it's somehow no
// longer in this series' episode list) at that exact saved position.
async function openWatchScreen(slideIndex, resume){
  const slide = slides[slideIndex];
  if(!slide) return;

  // Real teardown of whatever was already playing (see stopWatchPlayback)
  // — this can be reached series-to-series without ever leaving the
  // 'watch' screen in between (a poster click while already watching
  // something else), so the normal "leaving this screen" trigger alone
  // isn't enough to release the outgoing real hls.js instance.
  if(watchPlaybackCtl) watchPlaybackCtl.destroy();

  watchSlide = slide;
  watchActiveEpisodeId = null;
  watchVideoEl = null;
  watchPlaybackCtl = null;
  watchActiveRange = 0;
  // Real loading state for the (usually brief, but real) wait on this
  // series' own real episode list — replaces what would otherwise be a
  // blank grid and a misleading "Select an episode to play" for a
  // series that in fact already has a real episode about to be chosen
  // automatically, not one that's genuinely waiting on a person to pick.
  watchPlayerHost.innerHTML = '<div class="watch-player-loading">' + narravaLoaderHtml('pulse') + '</div>';
  watchBreadcrumbEl.innerHTML = 'Home / ' + escapeWatchHtml(slide.title) + ' / <span>…</span>';
  watchTitleEl.textContent = slide.title;
  watchTagsEl.innerHTML = heroTagsFor(slide).map(t => '<span class="watch-tag">' + t + '</span>').join('');
  watchLikeBtn.classList.toggle('active', slide.liked);
  watchLikeCount.textContent = String(slide.likes);
  watchSaveBtn.classList.toggle('active', slide.saved);
  watchCommentCount.textContent = String(slide.commentCount);
  watchEpisodes = [];
  watchEpRangesEl.innerHTML = '';
  watchEpisodeGrid.innerHTML = narravaLoaderHtml('pulse', 'Loading episodes…');

  showScreen('watch');
  loadWatchSocialState(slide);

  const episodes = await fetchEpisodesForSeries(slide.id);
  if(watchSlide !== slide) return; // navigated to a different series (or away) before this resolved
  watchEpisodes = episodes;

  const resumeEp = resume ? watchEpisodes.find(e => e.id === resume.episodeId) : null;
  if(resumeEp) watchPlayEpisode(resumeEp, resume.positionSeconds);
  else watchPlayEpisode(watchEpisodes[0]);
}

// Real like count + this viewer's own liked/saved state (social.js),
// fetched every time the watch page opens a series — applied to the DOM
// only if this is still the current slide by the time it resolves, same
// "don't let a stale fetch overwrite what's actually on screen" guard
// as the mobile feed's loadFeedSocialState.
async function loadWatchSocialState(slide){
  const state = await fetchSeriesSocialState(slide.id);
  slide.likes = state.likeCount;
  slide.liked = state.liked;
  slide.saved = state.saved;
  slide.commentCount = state.commentCount;
  if(watchSlide === slide){
    watchLikeBtn.classList.toggle('active', slide.liked);
    watchLikeCount.textContent = String(slide.likes);
    watchSaveBtn.classList.toggle('active', slide.saved);
    watchCommentCount.textContent = String(slide.commentCount);
  }
}

// Same as the browser's own Back: returns to whatever screen this was
// opened from (nav.js), rather than pushing a fresh Home entry on top.
watchBackBtn.addEventListener('click', () => navBack());

// Real, draggable seeking — a real <input type=range>'s own native drag
// handling, not hand-rolled pointer math. See app.js's identical
// scrubRange wiring for why `watchScrubbing` and the live 'input' seek
// (not just on release) matter.
watchScrubRange.addEventListener('input', () => {
  watchScrubbing = true;
  if(watchVideoEl) watchVideoEl.currentTime = parseFloat(watchScrubRange.value);
  const pct = watchScrubRange.max > 0 ? (watchScrubRange.value / watchScrubRange.max) * 100 : 0;
  watchScrubRange.style.setProperty('--scrub-pct', pct + '%');
});
watchScrubRange.addEventListener('change', () => { watchScrubbing = false; });

// Real tap-to-pause / press-and-hold-to-2x, confirmed directly against
// reelshort.com — see the WATCH_HOLD_SPEED comment above. No swipe
// gesture exists on this screen to guard against (unlike the mobile
// feed), so this is simpler: just a real press/release pair deciding
// tap vs. hold. Attached to the stable watchPlayerHost container rather
// than the <video> itself, since that's replaced on every episode
// switch (watchPlayEpisode) while this only needs wiring once.
watchPlayerHost.addEventListener('pointerdown', () => {
  if(!watchVideoEl) return;
  watchPressStartTime = performance.now();
  watchPressHolding = !watchVideoEl.paused;
  if(watchPressHolding) watchVideoEl.playbackRate = WATCH_HOLD_SPEED;
});
function endWatchPress(){
  if(!watchVideoEl) return;
  const wasHolding = watchPressHolding;
  const elapsed = performance.now() - watchPressStartTime;
  watchPressHolding = false;
  if(wasHolding) watchVideoEl.playbackRate = 1; // instant, exactly where playback actually is
  if(elapsed > WATCH_TAP_MAX_MS) return; // a genuine hold already did its one real job above
  if(watchVideoEl.paused){
    watchVideoEl.play().catch(() => {});
  } else {
    watchVideoEl.pause();
  }
}
watchPlayerHost.addEventListener('pointerup', endWatchPress);
watchPlayerHost.addEventListener('pointercancel', endWatchPress);

// Comment panel: a fixed drawer over the existing layout, opened/closed
// by toggling one class — never part of the document flow, so it can
// never push the episode grid down. Real comments now (series_comments
// via get_series_comments — see comments-panel.js).
function openWatchComments(){
  if(!watchSlide) return;
  watchCommentsBackdrop.classList.add('open');
  watchCommentsController.load(watchSlide.id);
}
function closeWatchComments(){
  watchCommentsBackdrop.classList.remove('open');
}
watchCommentBtn.addEventListener('click', openWatchComments);
watchCommentsClose.addEventListener('click', closeWatchComments);
watchCommentsBackdrop.addEventListener('click', (e) => {
  if(e.target === watchCommentsBackdrop) closeWatchComments();
});

// Real like: series_likes (social.js), not a session-only toggle. A
// signed-out click opens the same sign-in modal every other
// account-gated action in this app already uses (toggleSeriesLike's own
// job) instead of doing nothing — null in that case, so the button is
// left exactly as it was. The count is re-fetched for real after a
// successful toggle rather than guessed locally.
watchLikeBtn.addEventListener('click', async () => {
  if(!watchSlide) return;
  const slide = watchSlide;
  const newLiked = await toggleSeriesLike(slide.id, slide.liked);
  if(newLiked === null) return;
  slide.liked = newLiked;
  slide.likes = await fetchSeriesLikeCount(slide.id);
  if(watchSlide === slide){
    watchLikeBtn.classList.toggle('active', slide.liked);
    watchLikeCount.textContent = String(slide.likes);
  }
});
// Same real shape as like, against series_saves — personal only, no
// public count.
watchSaveBtn.addEventListener('click', async () => {
  if(!watchSlide) return;
  const slide = watchSlide;
  const newSaved = await toggleSeriesSave(slide.id, slide.saved);
  if(newSaved === null) return;
  slide.saved = newSaved;
  if(watchSlide === slide) watchSaveBtn.classList.toggle('active', slide.saved);
});
// Real sharing (shareSeries, shared-utils.js) — same real mechanism the
// mobile feed's own shareBtn uses, not a second implementation.
watchShareBtn.addEventListener('click', () => {
  watchShareBtn.classList.add('pulse');
  setTimeout(() => watchShareBtn.classList.remove('pulse'), 350);
  if(watchSlide) shareSeries(watchSlide.title, watchSlide.id);
});
