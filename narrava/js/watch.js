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
//     the real site — Narrava has no real counts for any of these, so
//     icon+label only, same honesty rule as every other fake number in
//     this app
//   - the episode grid is 6 columns of ~62x46 cells, grouped into range
//     tabs ("0-49", "50-63", "All Episodes") once there are enough
//     episodes to need it — a 2-3 episode series never shows this
//
// Opened instead of the mobile swipe feed when a series is opened from
// the desktop layout — see openSeriesInFeed in app.js, which is the one
// place that decides which screen a poster/hero/search-result click
// lands on.
//
// The video itself reuses the exact same Bunny embed URL app.js already
// builds (bunnyEmbedSrc) in a plain iframe — no preload/promote
// machinery here, since that exists only for the feed's swipe-and-
// autoplay-instantly behaviour and has no purpose on a page that plays
// one chosen episode at a time.

const WATCH_RANGE_SIZE = 30;

let watchSlide = null;
let watchEpisodes = [];
let watchActiveEpisodeId = null;
let watchActiveRange = 0; // index into the RANGE_SIZE-sized chunks of watchEpisodes
let watchPlayer = null;   // playerjs.Player wrapping the active episode's iframe, or null

const watchBackBtn = document.getElementById('watchBackBtn');
const watchPlayerHost = document.getElementById('watchPlayerHost');
const watchBreadcrumbEl = document.getElementById('watchBreadcrumb');
const watchTitleEl = document.getElementById('watchTitle');
const watchTagsEl = document.getElementById('watchTags');
const watchLikeBtn = document.getElementById('watchLikeBtn');
const watchSaveBtn = document.getElementById('watchSaveBtn');
const watchShareBtn = document.getElementById('watchShareBtn');
const watchCommentBtn = document.getElementById('watchCommentBtn');
const watchCommentsBackdrop = document.getElementById('watchCommentsBackdrop');
const watchCommentsClose = document.getElementById('watchCommentsClose');
const watchCommentsBody = document.getElementById('watchCommentsBody');
const watchEpRangesEl = document.getElementById('watchEpRanges');
const watchEpisodeGrid = document.getElementById('watchEpisodeGrid');

// Same reasoning as app.js's stopFeedPlayback: leaving this screen for
// any other one must actually tear the iframe down (removing it from
// the DOM is what stops the video), not just hide it — called from
// showScreen() whenever the target screen isn't 'watch'.
function stopWatchPlayback(){
  saveCurrentWatchProgress();
  watchPlayerHost.innerHTML = '';
  watchPlayer = null;
  watchActiveEpisodeId = null;
  closeWatchComments();
}

// Reads the real position off the actual playing player (never assumed)
// and upserts it via watch-progress.js. No-ops quietly if nothing is
// playing right now, or if nobody's signed in (saveWatchProgress's own
// job). Called periodically, on pause, and whenever this screen leaves
// the current episode (stopWatchPlayback, switching episodes).
function saveCurrentWatchProgress(){
  if(!watchPlayer || !watchActiveEpisodeId || !watchSlide) return;
  const player = watchPlayer;
  const episodeId = watchActiveEpisodeId;
  const seriesId = watchSlide.id;
  player.getCurrentTime((seconds) => {
    if(watchPlayer !== player || watchActiveEpisodeId !== episodeId) return;
    saveWatchProgress(episodeId, seriesId, seconds);
  });
}

// Same 15s cadence as the mobile feed (app.js) — frequent enough that a
// refresh/crash never loses more than a few seconds of real progress.
setInterval(saveCurrentWatchProgress, 15000);

// player.js's 'ready' event only means the postMessage bridge to the
// iframe is up — NOT that the underlying video's own duration/seekable
// range has loaded yet. Confirmed live: calling setCurrentTime right on
// 'ready' is silently ignored (tested with a target far past anything
// that could've naturally played by then — it landed nowhere near it).
// getDuration reporting a real, non-zero value is what's actually
// confirmed live to mean the seek will stick, so this polls for that
// first. Gives up after ~10s of polling rather than looping forever if
// a duration genuinely never arrives.
function seekWhenSeekable(player, episodeId, seconds, attemptsLeft){
  if(watchActiveEpisodeId !== episodeId) return; // navigated away
  player.getDuration((duration) => {
    if(watchActiveEpisodeId !== episodeId) return;
    if(duration && duration > 0){
      player.setCurrentTime(seconds);
      return;
    }
    if(attemptsLeft <= 0) return;
    setTimeout(() => seekWhenSeekable(player, episodeId, seconds, attemptsLeft - 1), 400);
  });
}

// resumeSeconds, when given, seeks the real player to that exact
// position — see seekWhenSeekable above for why that's more than just
// calling setCurrentTime once on 'ready'.
function watchPlayEpisode(ep, resumeSeconds){
  if(!ep || !ep.bunny_video_id) return;
  saveCurrentWatchProgress();

  watchActiveEpisodeId = ep.id;
  watchPlayer = null;
  const iframe = document.createElement('iframe');
  iframe.src = bunnyEmbedSrc(ep.bunny_video_id);
  iframe.setAttribute('allow', 'autoplay');
  iframe.setAttribute('allowfullscreen', '');
  watchPlayerHost.innerHTML = '';
  watchPlayerHost.appendChild(iframe);

  const player = new playerjs.Player(iframe);
  const episodeId = ep.id;
  player.on('ready', () => {
    if(watchActiveEpisodeId !== episodeId) return; // navigated away before ready
    watchPlayer = player;
    if(resumeSeconds && resumeSeconds > 0.5) seekWhenSeekable(player, episodeId, resumeSeconds, 25);
  });
  player.on('pause', () => {
    if(watchPlayer !== player) return;
    saveCurrentWatchProgress();
  });

  // The breadcrumb and heading are per-episode (the real site's own
  // heading is literally "Episode N - <title>"), so they update with
  // whichever episode is actually playing.
  watchBreadcrumbEl.innerHTML = 'Home / ' + escapeWatchHtml(watchSlide.title) + ' / <span>Episode ' + ep.episode_number + '</span>';
  watchTitleEl.textContent = ep.title ? ('Ep ' + ep.episode_number + ': ' + ep.title) : ('Episode ' + ep.episode_number);

  renderWatchEpisodes();
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
  const start = watchActiveRange * WATCH_RANGE_SIZE;
  const visible = watchEpisodes.slice(start, start + WATCH_RANGE_SIZE);

  watchEpisodeGrid.innerHTML = visible
    .map(ep => watchEpCardHtml(ep, ep.episode_number > freeCount))
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

  watchSlide = slide;
  watchActiveEpisodeId = null;
  watchPlayer = null;
  watchActiveRange = 0;
  watchPlayerHost.innerHTML = '';
  watchBreadcrumbEl.innerHTML = 'Home / ' + escapeWatchHtml(slide.title) + ' / <span>…</span>';
  watchTitleEl.textContent = slide.title;
  watchTagsEl.innerHTML = heroTagsFor(slide).map(t => '<span class="watch-tag">' + t + '</span>').join('');
  watchLikeBtn.classList.toggle('active', slide.liked);
  watchSaveBtn.classList.toggle('active', slide.saved);
  watchEpisodes = [];
  watchEpRangesEl.innerHTML = '';
  watchEpisodeGrid.innerHTML = '';

  showScreen('watch');

  const episodes = await fetchEpisodesForSeries(slide.id);
  if(watchSlide !== slide) return; // navigated to a different series (or away) before this resolved
  watchEpisodes = episodes;

  const resumeEp = resume ? watchEpisodes.find(e => e.id === resume.episodeId) : null;
  if(resumeEp) watchPlayEpisode(resumeEp, resume.positionSeconds);
  else watchPlayEpisode(watchEpisodes[0]);
}

watchBackBtn.addEventListener('click', () => showScreen('discover'));

// Comment panel: a fixed drawer over the existing layout, opened/closed
// by toggling one class — never part of the document flow, so it can
// never push the episode grid down. There is no real comment data
// anywhere in this app yet, so the body is always this one honest empty
// state, never invented comments.
function openWatchComments(){
  watchCommentsBody.innerHTML = '<div class="watch-comments-empty">No comments yet.</div>';
  watchCommentsBackdrop.classList.add('open');
}
function closeWatchComments(){
  watchCommentsBackdrop.classList.remove('open');
}
watchCommentBtn.addEventListener('click', openWatchComments);
watchCommentsClose.addEventListener('click', closeWatchComments);
watchCommentsBackdrop.addEventListener('click', (e) => {
  if(e.target === watchCommentsBackdrop) closeWatchComments();
});

watchLikeBtn.addEventListener('click', () => {
  if(!watchSlide) return;
  watchSlide.liked = !watchSlide.liked;
  watchLikeBtn.classList.toggle('active', watchSlide.liked);
});
watchSaveBtn.addEventListener('click', () => {
  if(!watchSlide) return;
  watchSlide.saved = !watchSlide.saved;
  watchSaveBtn.classList.toggle('active', watchSlide.saved);
});
// No real share integration exists anywhere in this app yet — same
// honest no-op-with-feedback the feed's own shareBtn already does.
watchShareBtn.addEventListener('click', () => {
  watchShareBtn.classList.add('pulse');
  setTimeout(() => watchShareBtn.classList.remove('pulse'), 350);
});
