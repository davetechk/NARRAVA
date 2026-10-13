// Desktop Watch page for one series: video, info column, episode grid with range tabs.
// Opened by openSeriesInFeed (app.js) on desktop.

const WATCH_RANGE_SIZE = 30;

let watchSlide = null;
let watchEpisodes = [];
let watchActiveEpisodeId = null;
let watchActiveRange = 0; // index of the current WATCH_RANGE_SIZE chunk
let watchVideoEl = null;     // active <video>, or null
let watchPlaybackCtl = null; // attachEpisodePlayback controller

let watchScrubbing = false; // true while dragging the scrub bar

// Tap to pause, hold for 2x (same as the feed)
const WATCH_HOLD_SPEED = 2;
const WATCH_TAP_MAX_MS = 200;
let watchPressStartTime = 0;
let watchPressHolding = false;

const watchBackBtn = document.getElementById('watchBackBtn');
const watchMuteBtn = document.getElementById('watchMuteBtn');
const watchPlayerBox = document.getElementById('watchPlayerBox');
const watchPlayerHost = document.getElementById('watchPlayerHost');
const watchScrubRange = document.getElementById('watchScrubRange');
const watchScrubDuration = document.getElementById('watchScrubDuration');
const watchBreadcrumbEl = document.getElementById('watchBreadcrumb');
const watchTitleEl = document.getElementById('watchTitle');
const watchTagsEl = document.getElementById('watchTags');
const watchLikeBtn = document.getElementById('watchLikeBtn');
const watchLikeCount = document.getElementById('watchLikeCount');
const watchSaveBtn = document.getElementById('watchSaveBtn');
const watchShareBtn = document.getElementById('watchShareBtn');
const watchCommentBtn = document.getElementById('watchCommentBtn');
const watchCommentCount = document.getElementById('watchCommentCount');
const watchSaveCount = document.getElementById('watchSaveCount');
const watchShareCount = document.getElementById('watchShareCount');
const watchCommentsBackdrop = document.getElementById('watchCommentsBackdrop');
const watchCommentsClose = document.getElementById('watchCommentsClose');
const watchCommentsBody = document.getElementById('watchCommentsBody');
const watchEpRangesEl = document.getElementById('watchEpRanges');
const watchEpisodeGrid = document.getElementById('watchEpisodeGrid');

// Leaving the page: tear the playback down (hls.js and the refresh timer too)
function stopWatchPlayback(){
  saveCurrentWatchProgress();
  if(watchPlaybackCtl) watchPlaybackCtl.destroy();
  watchPlayerHost.innerHTML = '';
  watchPlayerBox.classList.remove('has-video', 'paused');
  watchVideoEl = null;
  watchPlaybackCtl = null;
  watchActiveEpisodeId = null;
  closeWatchComments();
  refreshDownloadButtons();
}

// Save the current position (no-op if nothing's playing)
function saveCurrentWatchProgress(){
  if(!watchVideoEl || !watchActiveEpisodeId || !watchSlide) return;
  saveWatchProgress(watchActiveEpisodeId, watchSlide.id, watchVideoEl.currentTime);
}

// Every 15s, like the feed
setInterval(saveCurrentWatchProgress, 15000);

// Pause for a rewarded ad (ads.js)
function pauseCurrentWatchEpisode(){
  if(watchVideoEl && !watchVideoEl.paused) watchVideoEl.pause();
}

// Load failed state; retry redoes the whole load
function showWatchLoadFailure(ep, resumeSeconds){
  watchPlayerHost.innerHTML = '<div class="watch-player-loading">' + narravaLoadFailedHtml('watchPlayerRetryBtn') + '</div>';
  document.getElementById('watchPlayerRetryBtn').addEventListener('click', () => watchPlayEpisode(ep, resumeSeconds));
}

// resumeSeconds: seek there once metadata loads
async function watchPlayEpisode(ep, resumeSeconds){
  if(!ep) return;
  // Locked: show the unlock panel instead
  if(!watchEpisodeUnlocked(ep)){ watchShowLockedEpisode(ep); return; }
  if(!ep.bunny_video_id) return;
  saveCurrentWatchProgress();
  if(watchPlaybackCtl) watchPlaybackCtl.destroy();
  watchLockedEpisodeId = null;

  const episodeId = ep.id;
  watchActiveEpisodeId = episodeId;
  watchVideoEl = null;
  watchPlaybackCtl = null;
  watchPlayerBox.classList.remove('has-video', 'paused');
  watchScrubDuration.textContent = ''; // length not known yet

  const video = document.createElement('video');
  video.controls = false;
  video.playsInline = true;
  video.muted = soundMuted; // shared sound preference (app.js)
  video.style.display = 'none';
  // Loader until the signed URL / hls.js setup resolves
  watchPlayerHost.innerHTML = '<div class="watch-player-loading">' + narravaLoaderHtml('pulse') + '</div>';
  watchPlayerHost.appendChild(video);
  updateWatchMuteButton();

  // Breadcrumb, heading and grid highlight update straight away
  watchBreadcrumbEl.innerHTML = 'Home / ' + escapeWatchHtml(watchSlide.title) + ' / <span>Episode ' + ep.episode_number + '</span>';
  watchTitleEl.textContent = ep.title ? ('Ep ' + ep.episode_number + ': ' + ep.title) : ('Episode ' + ep.episode_number);
  renderWatchEpisodes();
  refreshDownloadButtons(); // Download follows the playing episode

  const ctl = await attachEpisodePlayback(video, episodeId, () => {
    // All retries used
    if(watchActiveEpisodeId !== episodeId) return; // navigated away
    showWatchLoadFailure(ep, resumeSeconds);
  });
  if(watchActiveEpisodeId !== episodeId) { if(ctl) ctl.destroy(); return; } // navigated away
  if(!ctl){
    // Refused: keep the loader, never fall back
    return;
  }
  watchVideoEl = video;
  watchPlaybackCtl = ctl;
  attachViewTracking(video, () => (watchActiveEpisodeId === episodeId) ? episodeId : null);
  watchScrubRange.value = video.currentTime || 0;
  // Metadata may already be loaded
  watchScrubRange.max = (video.duration && isFinite(video.duration)) ? video.duration : 0;
  watchScrubRange.style.setProperty('--scrub-pct', '0%');
  // Blank until the duration is known
  watchScrubDuration.textContent = videoDurationLabel(video);

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
    watchScrubDuration.textContent = videoDurationLabel(video);
  });
  video.addEventListener('durationchange', () => {
    if(watchVideoEl !== video) return;
    watchScrubDuration.textContent = videoDurationLabel(video);
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

// free_episode_count, 0 if missing
function watchFreeCount(){
  return (watchSlide && typeof watchSlide.freeEpisodeCount === 'number') ? watchSlide.freeEpisodeCount : 0;
}

// Lock rule: isEpisodeUnlocked (coins.js)
function watchEpisodeUnlocked(ep){
  return isEpisodeUnlocked(watchFreeCount(), ep);
}

// Player area for a locked episode, with the unlock button
let watchLockedEpisodeId = null;
function watchShowLockedEpisode(ep){
  saveCurrentWatchProgress();
  if(watchPlaybackCtl) watchPlaybackCtl.destroy();
  watchPlaybackCtl = null;
  watchVideoEl = null;
  watchActiveEpisodeId = ep.id;
  watchLockedEpisodeId = ep.id;
  watchPlayerBox.classList.remove('has-video', 'paused');
  watchScrubDuration.textContent = '';
  watchPlayerHost.innerHTML =
    '<div class="watch-locked">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>' +
      '<div class="watch-locked-title">Episode ' + ep.episode_number + ' is locked</div>' +
      '<button type="button" class="watch-locked-btn" id="watchUnlockBtn">Unlock · 1 Nava Coin</button>' +
    '</div>';
  document.getElementById('watchUnlockBtn').addEventListener('click', () => watchPromptUnlock(ep));
  watchBreadcrumbEl.innerHTML = 'Home / ' + escapeWatchHtml(watchSlide.title) + ' / <span>Episode ' + ep.episode_number + '</span>';
  watchTitleEl.textContent = ep.title ? ('Ep ' + ep.episode_number + ': ' + ep.title) : ('Episode ' + ep.episode_number);
  renderWatchEpisodes();
}

function watchPromptUnlock(ep){
  const slide = watchSlide;
  openUnlockPrompt(ep, () => {
    if(watchSlide !== slide) return; // left this series
    watchPlayEpisode(ep);
  });
}

// Repaint lock icons; play the locked episode if it's now unlocked
document.addEventListener('narrava:coins-changed', () => {
  if(!watchSlide || !watchEpisodes.length) return;
  if(watchLockedEpisodeId && watchActiveEpisodeId === watchLockedEpisodeId){
    const ep = watchEpisodes.find(e => e.id === watchLockedEpisodeId);
    if(ep && watchEpisodeUnlocked(ep) && !watchScreen.classList.contains('screen-hidden')){ watchPlayEpisode(ep); return; }
  }
  renderWatchEpisodes();
});

function watchEpCardHtml(ep, locked){
  const isActive = ep.id === watchActiveEpisodeId;
  // Locked cards keep the number, with a lock badge
  const lockBadge = locked
    ? '<svg class="watch-ep-card-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>'
    : '';
  return '<button type="button" class="watch-ep-card' + (isActive ? ' active' : '') + (locked ? ' locked' : '') +
    '" data-ep-id="' + ep.id + '"' + (locked ? ' aria-label="Episode ' + ep.episode_number + ', locked"' : '') + '>' +
    lockBadge + ep.episode_number +
  '</button>';
}

// Range tabs only when there are more than WATCH_RANGE_SIZE episodes
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

  const start = watchActiveRange * WATCH_RANGE_SIZE;
  const visible = watchEpisodes.slice(start, start + WATCH_RANGE_SIZE);

  watchEpisodeGrid.innerHTML = visible
    .map(ep => watchEpCardHtml(ep, !watchEpisodeUnlocked(ep)))
    .join('');
  // Locked card opens the unlock prompt
  watchEpisodeGrid.querySelectorAll('.watch-ep-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const ep = watchEpisodes.find(e => e.id === btn.dataset.epId);
      if(!ep) return;
      if(btn.classList.contains('locked')) watchPromptUnlock(ep);
      else watchPlayEpisode(ep);
    });
  });
}

// slideIndex into `slides`. resume: {episodeId, positionSeconds} from Continue Watching.
async function openWatchScreen(slideIndex, resume){
  const slide = slides[slideIndex];
  if(!slide) return;

  // Can go series to series without leaving the page, so tear down here too
  if(watchPlaybackCtl) watchPlaybackCtl.destroy();

  watchSlide = slide;
  watchActiveEpisodeId = null;
  watchLockedEpisodeId = null;
  watchVideoEl = null;
  watchPlaybackCtl = null;
  watchActiveRange = 0;
  // Loader while the episode list loads
  watchPlayerHost.innerHTML = '<div class="watch-player-loading">' + narravaLoaderHtml('pulse') + '</div>';
  watchBreadcrumbEl.innerHTML = 'Home / ' + escapeWatchHtml(slide.title) + ' / <span>…</span>';
  watchTitleEl.textContent = slide.title;
  watchTagsEl.innerHTML = heroTagsFor(slide).map(t => '<span class="watch-tag">' + t + '</span>').join('');
  watchLikeBtn.classList.toggle('active', slide.liked);
  watchLikeCount.textContent = String(slide.likes);
  watchSaveBtn.classList.toggle('active', slide.saved);
  watchCommentCount.textContent = String(slide.commentCount);
  watchSaveCount.textContent = String(slide.saves);
  watchShareCount.textContent = String(slide.shares);
  watchEpisodes = [];
  watchEpRangesEl.innerHTML = '';
  // Episode grid skeleton (the player keeps its loader)
  showSkeletonLogo();
  watchEpisodeGrid.innerHTML = skeletonWatchEpisodeGridHtml(12);

  showScreen('watch');
  loadWatchSocialState(slide);

  const episodes = await fetchEpisodesForSeries(slide.id);
  if(watchSlide !== slide){ hideSkeletonLogo(); return; } // navigated away
  watchEpisodes = episodes;

  // No episodes: empty state (otherwise the skeleton would stay)
  if(watchEpisodes.length === 0){
    watchEpisodeGrid.innerHTML = '<div class="discover-empty">No episodes yet.</div>';
  }
  hideSkeletonLogo();

  const resumeEp = resume ? watchEpisodes.find(e => e.id === resume.episodeId) : null;
  if(resumeEp) watchPlayEpisode(resumeEp, resume.positionSeconds);
  else watchPlayEpisode(watchEpisodes[0]);
}

// Like count and liked/saved state; ignored if the series changed meanwhile
async function loadWatchSocialState(slide){
  const state = await fetchSeriesSocialState(slide.id);
  slide.likes = state.likeCount;
  slide.liked = state.liked;
  slide.saved = state.saved;
  slide.commentCount = state.commentCount;
  slide.saves = state.saveCount;
  slide.shares = state.shareCount;
  if(watchSlide === slide){
    watchLikeBtn.classList.toggle('active', slide.liked);
    watchLikeCount.textContent = String(slide.likes);
    watchSaveBtn.classList.toggle('active', slide.saved);
    watchCommentCount.textContent = String(slide.commentCount);
    renderWatchSaveShareCounts(slide);
  }
}

// Save/share totals for the series on screen (also after a share)
function renderWatchSaveShareCounts(slide){
  if(watchSlide !== slide) return;
  watchSaveCount.textContent = String(slide.saves);
  watchShareCount.textContent = String(slide.shares);
}

watchBackBtn.addEventListener('click', () => navBack());

// Live seeking while dragging
watchScrubRange.addEventListener('input', () => {
  watchScrubbing = true;
  if(watchVideoEl) watchVideoEl.currentTime = parseFloat(watchScrubRange.value);
  const pct = watchScrubRange.max > 0 ? (watchScrubRange.value / watchScrubRange.max) * 100 : 0;
  watchScrubRange.style.setProperty('--scrub-pct', pct + '%');
});
watchScrubRange.addEventListener('change', () => { watchScrubbing = false; });

// Tap vs hold, on the host (the <video> is replaced per episode)
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
  if(wasHolding) watchVideoEl.playbackRate = 1;
  if(elapsed > WATCH_TAP_MAX_MS) return; // a hold isn't a tap
  if(watchVideoEl.paused){
    watchVideoEl.play().catch(() => {});
  } else {
    watchVideoEl.pause();
  }
}
watchPlayerHost.addEventListener('pointerup', endWatchPress);
watchPlayerHost.addEventListener('pointercancel', endWatchPress);

// Comment drawer (fixed, out of the flow)
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

// Like (signed-out click opens sign-in); count re-fetched after
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
// Save; total re-fetched after
watchSaveBtn.addEventListener('click', async () => {
  if(!watchSlide) return;
  const slide = watchSlide;
  const newSaved = await toggleSeriesSave(slide.id, slide.saved);
  if(newSaved === null) return;
  slide.saved = newSaved;
  const counts = await fetchSeriesSaveShareCounts(slide.id);
  slide.saves = counts.saves;
  slide.shares = counts.shares;
  if(watchSlide === slide){
    watchSaveBtn.classList.toggle('active', slide.saved);
    renderWatchSaveShareCounts(slide);
  }
});
// Share (shareSeries, shared-utils.js)
watchShareBtn.addEventListener('click', () => {
  watchShareBtn.classList.add('pulse');
  setTimeout(() => watchShareBtn.classList.remove('pulse'), 350);
  if(watchSlide) shareSeries(watchSlide.title, watchSlide.id);
});

// ---------------- Mute / unmute ----------------
// Shares soundMuted with the feed. Finds the <video> in the host while it's still loading.
function watchCurrentVideo(){
  return watchVideoEl || watchPlayerHost.querySelector('video');
}

function updateWatchMuteButton(){
  const v = watchCurrentVideo();
  const off = v ? v.muted : soundMuted;
  watchMuteBtn.classList.toggle('muted', off);
  watchMuteBtn.setAttribute('aria-label', off ? 'Unmute' : 'Mute');
  watchMuteBtn.setAttribute('aria-pressed', off ? 'true' : 'false');
}

watchMuteBtn.addEventListener('click', () => {
  const v = watchCurrentVideo();
  const nowOff = !(v ? v.muted : soundMuted);
  soundMuted = nowOff;
  if(v) v.muted = nowOff;
  updateWatchMuteButton();
  updateMuteButton(); // keep the feed's button in step
});
updateWatchMuteButton();
