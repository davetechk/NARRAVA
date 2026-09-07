// watch.js
//
// Desktop-only "watch" screen for a single series: a real video player,
// title/real genre tags/like/save/share, a numbered episode grid (locked
// past the series' real free_episode_count), and the full episode list.
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

let watchSlide = null;
let watchEpisodes = [];
let watchActiveEpisodeId = null;

const watchPlayerHost = document.getElementById('watchPlayerHost');
const watchTitleEl = document.getElementById('watchTitle');
const watchTagsEl = document.getElementById('watchTags');
const watchLikeBtn = document.getElementById('watchLikeBtn');
const watchSaveBtn = document.getElementById('watchSaveBtn');
const watchShareBtn = document.getElementById('watchShareBtn');
const watchEpisodeGrid = document.getElementById('watchEpisodeGrid');
const watchEpisodeList = document.getElementById('watchEpisodeList');

// Same reasoning as app.js's stopFeedPlayback: leaving this screen for
// any other one must actually tear the iframe down (removing it from
// the DOM is what stops the video), not just hide it — called from
// showScreen() whenever the target screen isn't 'watch'.
function stopWatchPlayback(){
  watchPlayerHost.innerHTML = '';
  watchActiveEpisodeId = null;
}

function watchPlayEpisode(ep){
  if(!ep || !ep.bunny_video_id) return;
  watchActiveEpisodeId = ep.id;
  watchPlayerHost.innerHTML = '<iframe src="' + bunnyEmbedSrc(ep.bunny_video_id) + '" allow="autoplay" allowfullscreen></iframe>';
  renderWatchEpisodes();
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
  const lockIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>';
  return '<button type="button" class="watch-ep-card' + (isActive ? ' active' : '') + (locked ? ' locked' : '') +
    '" data-ep-id="' + ep.id + '"' + (locked ? ' disabled' : '') + '>' +
    (locked ? lockIcon : ep.episode_number) +
  '</button>';
}

function watchEpRowHtml(ep, locked){
  const isActive = ep.id === watchActiveEpisodeId;
  return '<button type="button" class="watch-ep-row' + (isActive ? ' active' : '') + (locked ? ' locked' : '') +
    '" data-ep-id="' + ep.id + '"' + (locked ? ' disabled' : '') + '>' +
    '<span class="watch-ep-row-num">Ep ' + ep.episode_number + '</span>' +
    '<span class="watch-ep-row-title">' + (ep.title ? ep.title : 'Untitled') + '</span>' +
    (locked ? '<svg class="watch-ep-row-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>' : '') +
  '</button>';
}

function renderWatchEpisodes(){
  const freeCount = watchFreeCount();

  watchEpisodeGrid.innerHTML = watchEpisodes
    .map(ep => watchEpCardHtml(ep, ep.episode_number > freeCount))
    .join('');
  watchEpisodeGrid.querySelectorAll('.watch-ep-card:not(.locked)').forEach(btn => {
    btn.addEventListener('click', () => watchPlayEpisode(watchEpisodes.find(e => e.id === btn.dataset.epId)));
  });

  watchEpisodeList.innerHTML = watchEpisodes
    .map(ep => watchEpRowHtml(ep, ep.episode_number > freeCount))
    .join('');
  watchEpisodeList.querySelectorAll('.watch-ep-row:not(.locked)').forEach(btn => {
    btn.addEventListener('click', () => watchPlayEpisode(watchEpisodes.find(e => e.id === btn.dataset.epId)));
  });
}

// slideIndex is `slides`' own index, same as every other openSeriesInFeed
// caller already passes in.
async function openWatchScreen(slideIndex){
  const slide = slides[slideIndex];
  if(!slide) return;

  watchSlide = slide;
  watchActiveEpisodeId = null;
  watchPlayerHost.innerHTML = '';
  watchTitleEl.textContent = slide.title;
  watchTagsEl.innerHTML = heroTagsFor(slide).map(t => '<span class="watch-tag">' + t + '</span>').join('');
  watchLikeBtn.classList.toggle('active', slide.liked);
  watchSaveBtn.classList.toggle('active', slide.saved);
  watchEpisodes = [];
  watchEpisodeGrid.innerHTML = '';
  watchEpisodeList.innerHTML = '<div class="watch-episodes-loading">Loading episodes…</div>';

  showScreen('watch');

  const episodes = await fetchEpisodesForSeries(slide.id);
  if(watchSlide !== slide) return; // navigated to a different series (or away) before this resolved
  watchEpisodes = episodes;
  renderWatchEpisodes();
  watchPlayEpisode(watchEpisodes[0]);
}

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
