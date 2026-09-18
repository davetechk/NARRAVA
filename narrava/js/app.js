// app.js
//
// All the interactive behaviour of the mockup: rendering the current
// slide, swipe/wheel navigation, like/save/comment/unlock buttons, and
// the "Get Coins" sheet. Like/save/comments are real now (series_likes/
// series_saves/series_comments via social.js/comments-panel.js). Coin
// balance and coin cost are still fake/frontend-only, exactly as in the
// original mockup — but which real episode is locked is not: it's the
// same free_episode_count rule the desktop watch page's grid already
// uses, and "unlocked" now means a real episode id has actually been
// paid for this session (slide.unlockedEpisodeIds), not a single
// one-episode-ahead flag.
//
// Swiping means two different real things depending on state: while
// just browsing, it moves between series (goTo), exactly as before.
// Once a series has actually been entered (openSeriesInFeed/
// enterMobileWatching), it moves through THAT series' own real episodes
// instead (see advanceForward/advanceBackward/goToEpisodeInSlide) —
// stopping dead at episode one going backward, and rolling straight
// into the next series' own watching state going forward once the
// current one genuinely runs out. A real, numbered jump grid (opened
// from the small episode badge, still visible while watching) lets
// someone jump straight to any of a series' real episodes the same way.
// Landing on a real locked episode, by any of these paths, never plays
// it — it shows the same real unlock prompt (unlockBtn below) every
// other locked episode in this app already uses.
//
// Video/preload identity throughout is keyed by the real EPISODE id,
// not the series id — a single slide can now point at different real
// videos over its lifetime (whichever episode is currently active), so
// "which video is this" and "which series is this slide" are tracked
// as two separate ids (currentVideoEpisodeId/currentVideoSeriesId etc.)
// rather than conflating them the way a series-id-only slide could
// safely assume before real episode navigation existed.

const regions = {
  NG:{ symbol:'₦', methods:['Card','Bank Transfer','Mobile Money'],
    packages:[
      {coins:100, price:'1,000', bonus:null},
      {coins:550, price:'5,000', bonus:'+10%'},
      {coins:1200, price:'10,000', bonus:'+20%'},
      {coins:3000, price:'25,000', bonus:'+35%'}
    ]},
  CA:{ symbol:'$', methods:['Card','Apple Pay','Google Pay'],
    packages:[
      {coins:100, price:'1.99', bonus:null},
      {coins:550, price:'9.99', bonus:'+10%'},
      {coins:1200, price:'19.99', bonus:'+20%'},
      {coins:3000, price:'49.99', bonus:'+35%'}
    ]}
};

let slides = [];
let slidesLoaded = false; // real fetchSlides() has actually resolved — see render()'s empty-feed branch, which needs this to tell "still loading" apart from "genuinely no series exist"
let idx = 0;
let coins = 3;

// Real System Settings (app_settings, admin/system-settings.html) — one
// real row, publicly readable, admin-only to write (confirmed live).
// Safe defaults here (nothing overridden, maintenance off, 5 featured)
// match today's real behavior exactly, so a failed fetch never silently
// changes anything — it just falls back to acting as if the settings
// screen had never been touched.
//
// Fetched once, immediately at script load (not inside init(), and not
// awaited by anything until it actually needs the answer) so both this
// file's own init() and discover.js's initDiscover() can await the same
// one real appSettingsReady promise before doing anything — the same
// real pattern slidesReady/continueWatchingReady already use for
// exactly this "don't act before the real data is in" reason.
let appSettings = { free_mode_enabled: false, maintenance_mode_enabled: false, featured_series_count: 5 };
let resolveAppSettingsReady;
const appSettingsReady = new Promise(resolve => { resolveAppSettingsReady = resolve; });

async function loadAppSettings(){
  try {
    const { data, error } = await supabaseClient
      .from('app_settings')
      .select('free_mode_enabled, maintenance_mode_enabled, featured_series_count')
      .eq('id', true)
      .single();
    if(error) throw error;
    if(data) appSettings = data;
  } catch(err){
    console.error('Narrava: failed to load app settings — falling back to safe defaults (nothing overridden)', err);
  }
  resolveAppSettingsReady();
}
loadAppSettings();

// Real maintenance mode (see init() below and discover.js's
// initDiscover(), both of which bail out before loading anything real
// once appSettingsReady confirms it's on) — replaces the entire real
// page with one plain, honest message, nothing else. The admin panel
// lives under admin/*.html, an entirely separate set of pages this
// function never touches, so it stays fully reachable regardless —
// confirmed live, not just assumed from separate file boundaries.
function renderMaintenanceMode(){
  document.body.innerHTML =
    '<div class="maintenance-screen">' +
      '<div class="maintenance-title">We’ll be back soon</div>' +
      '<div class="maintenance-sub">Narrava is temporarily down for maintenance. Please check back shortly.</div>' +
    '</div>';
}

// Real video playback state — a real native <video> element plus hls.js
// (video-player.js), identity is the real EPISODE id throughout (see
// header comment above), not the series/slide id, since one slide can
// point at different real episodes over time.
let currentVideoEl = null;         // the real, active <video> element for the visible episode, or null
let currentPlaybackCtl = null;     // its attachEpisodePlayback() controller (video-player.js) — owns auth refresh, .destroy() tears the real playback down
let currentVideoEpisodeId = null;  // real episode id currentVideoEl belongs to
let currentVideoSeriesId = null;   // the slide/series that episode belongs to, kept in lockstep with currentVideoEpisodeId — saveCurrentFeedProgress needs both, and this avoids re-deriving the series by searching `slides` after it may have already moved on to a different episode
let pendingResumeEpisodeId = null; // real episode id the automatic resume wants seeked once its video is ready (see enterMobileWatching/promotePreload)
let pendingResumeSeconds = 0;
let renderedMediaEpisodeId = null; // real episode id whose media (video or art) is currently in #bgvideo, so unrelated re-renders (unlock, continue) don't restart a playing video

// Real playback controls (video-controls in index.html) — the same real
// <video> element's own currentTime/duration/playbackRate throughout,
// never a fabricated position or speed.
let scrubbing = false; // true while the viewer's own finger/pointer is actively dragging scrubRange — timeupdate skips updating it meanwhile so it never fights the drag

// Press-and-hold-to-fast-forward on the video itself (playToggle below)
// — separate, already-confirmed mechanic, untouched by the real chrome
// show/hide sequence below: holding anywhere on the video jumps
// instantly to 2x for exactly as long as it's actually held, snapping
// back to 1x the instant it's released, no ramp either direction.
// HOLD_SPEED/TAP_MAX_MS aren't from the reference itself (only the real
// 2x value and the "instant, no ramp" shape are confirmed) —
// TAP_MAX_MS is a standard tap-vs-hold threshold, open to correction if
// it doesn't feel right live.
const HOLD_SPEED = 2;
const TAP_MAX_MS = 200;
const SWIPE_CANCEL_PX = 15; // a real vertical swipe (forward/backward nav) cancels the tap/hold read entirely — feed's own touchstart/touchend already owns that gesture
let pressStartY = null;
let pressStartTime = 0;
let pressHolding = false;
let pressMoved = false;

// The real chrome group while watching — name (.title), description
// (.synopsis), social icons (.actionrail), and the scrub bar
// (.video-controls) — confirmed directly, more than once, as one
// single group that always moves together, replacing the old
// reference-matched "tap pauses and shows controls together" behavior
// entirely, not merging with it:
//   1. Entering an episode shows the whole group immediately.
//   2. After 2 real seconds of actually playing, the whole group
//      auto-hides together — the video itself keeps playing.
//   3. A tap while hidden reveals the whole group and does NOT touch
//      play/pause at all.
//   4. A tap while already showing pauses (or resumes) the video —
//      the real toggle every tap here has always done, just decided by
//      "is the group visible" now, not by a fixed two-tap sequence.
//   5. Resuming playback (from either path above) rearms the same real
//      2-second timer, driven off the video's own real 'playing'/
//      'pause' events (see attachPlaybackControls) rather than guessed
//      at from when a tap happened — so it fires the same way whether
//      playback resumed from this tap logic or from anywhere else.
// feed.chrome-hidden (styles.css) is the one and only thing that ever
// hides the group, and it always hides all of it together.
const CHROME_AUTOHIDE_MS = 2000;
let chromeHideTimer = null;
function showChrome(){
  feed.classList.remove('chrome-hidden');
}
function hideChrome(){
  feed.classList.add('chrome-hidden');
}
function clearChromeHideTimer(){
  if(chromeHideTimer){ clearTimeout(chromeHideTimer); chromeHideTimer = null; }
}
function armChromeHideTimer(){
  clearChromeHideTimer();
  chromeHideTimer = setTimeout(() => { chromeHideTimer = null; hideChrome(); }, CHROME_AUTOHIDE_MS);
}

// episodeId -> { video, ctl, ready } for a video warming up off-screen
// ahead of time (see preloadVideo/promotePreload) — a real <video> element
// in #preloadHost, already fetching its real signed URL and buffering via
// hls.js, well before it's ever shown, so a swipe can land on an
// already-playing video instead of waiting on it cold.
const preloadCache = {};
const preloadHost = document.getElementById('preloadHost');
let region = 'NG';
let selectedPkg = 1;
let selectedMethod = 0;

const bgvideo = document.getElementById('bgvideo');
const spine = document.getElementById('spine');
const pager = document.getElementById('pager');
const epBadge = document.getElementById('epBadge');
const titleEl = document.getElementById('title');
const synopsisEl = document.getElementById('synopsis');
const likeCount = document.getElementById('likeCount');
const likeBtn = document.getElementById('likeBtn');
const bookmarkBtn = document.getElementById('bookmarkBtn');
const commentBtn = document.getElementById('commentBtn');
const commentCount = document.getElementById('commentCount');
const commentsSheetBackdrop = document.getElementById('commentsSheetBackdrop');
const commentsSheet = document.getElementById('commentsSheet');
const commentsSheetClose = document.getElementById('commentsSheetClose');
const episodeGridBackdrop = document.getElementById('episodeGridBackdrop');
const episodeGridSheet = document.getElementById('episodeGridSheet');
const episodeGridClose = document.getElementById('episodeGridClose');
const episodeGridBody = document.getElementById('episodeGridBody');
const unlockBtn = document.getElementById('unlockBtn');
const unlockLabel = document.getElementById('unlockLabel');
const scrubRange = document.getElementById('scrubRange');
const videoControls = document.getElementById('videoControls');
const coinBalance = document.getElementById('coinBalance');
const feed = document.getElementById('feed');
const playToggle = document.getElementById('playToggle');
const coinsChip = document.getElementById('coinsChip');
const sheetBackdrop = document.getElementById('sheetBackdrop');
const coinSheet = document.getElementById('coinSheet');
const sheetClose = document.getElementById('sheetClose');
const packagesWrap = document.getElementById('packages');
const methodsWrap = document.getElementById('methods');
const payBtn = document.getElementById('payBtn');
const ctaRow = document.querySelector('.ctarow');
const discoverScreen = document.getElementById('discoverScreen');
const libraryScreen = document.getElementById('libraryScreen');
const profileScreen = document.getElementById('profileScreen');
const watchScreen = document.getElementById('watchScreen');
const navHome = document.getElementById('navHome');
const navForYou = document.getElementById('navForYou');
const navLibrary = document.getElementById('navLibrary');
const navProfile = document.getElementById('navProfile');
// Desktop-only top bar nav (>=900px, replaces the old left sidebar — see
// styles.css). Same destinations as navHome/navForYou/navProfile above,
// just a second set of clickable elements for the wide-screen layout;
// they call the exact same showScreen() function, no separate
// navigation logic.
const topbarHome = document.getElementById('topbarHome');
const topbarForYou = document.getElementById('topbarForYou');
const topbarLibrary = document.getElementById('topbarLibrary');
const topbarProfile = document.getElementById('topbarProfile');
const topbarSearchBtn = document.getElementById('topbarSearchBtn');
const topbarProfileBtn = document.getElementById('topbarProfileBtn');
const topbarTopUpBtn = document.getElementById('topbarTopUpBtn');
const topbarDesktopInner = document.getElementById('topbarDesktopInner');
const topbarSearchBar = document.getElementById('topbarSearchBar');
const topbarSearchBackdrop = document.getElementById('topbarSearchBackdrop');
const topbarSearchInput = document.getElementById('topbarSearchInput');

// Screen switching between the "Home" (Discover) grid and the "For You"
// swipe feed. Both screens stay mounted and populated at all times —
// this just toggles which one is visible, so switching back to a
// screen never re-fetches or re-renders it from scratch.
//
// Also toggles `discover-active` / `feed-active` on <body>: above the
// desktop breakpoint, styles.css uses these to switch each screen into
// its own desktop layout (top bar + grid for Discover, top bar + centered
// video + beside-video info/actions for For You) instead of the mobile
// phone-frame presentation. Below the breakpoint neither class does
// anything — mobile stays exactly as it was.
function showScreen(name){
  // Screen/nav classes are switched FIRST, before anything below reacts
  // to them — render()'s own "is the feed actually visible" check (see
  // its guard around renderMedia) reads feed's screen-hidden class, so
  // that class has to already reflect the screen being switched TO by
  // the time render() runs, not the one being left.
  feed.classList.toggle('screen-hidden', name !== 'feed');
  discoverScreen.classList.toggle('screen-hidden', name !== 'discover');
  libraryScreen.classList.toggle('screen-hidden', name !== 'library');
  profileScreen.classList.toggle('screen-hidden', name !== 'profile');
  watchScreen.classList.toggle('screen-hidden', name !== 'watch');
  navHome.classList.toggle('active', name === 'discover');
  navForYou.classList.toggle('active', name === 'feed');
  navLibrary.classList.toggle('active', name === 'library');
  navProfile.classList.toggle('active', name === 'profile');
  topbarHome.classList.toggle('active', name === 'discover');
  topbarForYou.classList.toggle('active', name === 'feed');
  topbarLibrary.classList.toggle('active', name === 'library');
  topbarProfile.classList.toggle('active', name === 'profile');
  document.body.classList.toggle('discover-active', name === 'discover');
  document.body.classList.toggle('feed-active', name === 'feed');

  if(name !== 'feed'){
    stopFeedPlayback();
  } else if(slides.length && renderedMediaEpisodeId !== slides[idx].episodeId){
    // Coming back into the feed after stopFeedPlayback tore its video
    // down (or before the very first render) — reload the current
    // slide's media the same way goTo/render always do.
    render();
  }
  // Same idea as stopFeedPlayback, for the desktop watch page's own
  // separate video (see watch.js) — leaving it for any other screen
  // must actually tear its iframe down too.
  if(name !== 'watch') stopWatchPlayback();
  // Any navigation closes the search takeover — openTopbarSearch()
  // itself calls showScreen('discover') before opening it, so this
  // no-ops harmlessly in that order rather than fighting it.
  closeTopbarSearch();

  // The real "returned to the home screen" moment pwa-install.js waits
  // for to offer its one real second install chance — see
  // notifyHomeScreenShown() there, which no-ops unless that chance is
  // genuinely earned (already watched part of an episode, first chance
  // already shown, second chance not shown yet).
  if(name === 'discover' && typeof notifyHomeScreenShown === 'function') notifyHomeScreenShown();
}

// Continue Watching: {series_id -> latest get_continue_watching row for
// that series}. One source of truth, read by two things — the silent
// auto-resume inside openSeriesInFeed below (every series-open, mobile
// and desktop) and discover.js's small floating "Continue" bar (mobile
// Home only). Neither of those is a separate lookup; both just read
// this map. get_continue_watching (unchanged, per the hard constraint
// against touching watch_progress/RLS/the RPC itself) already does the
// real signed-in-viewer + "has anyone actually watched anything"
// filtering server-side.
let continueWatchingMap = new Map();

async function refreshContinueWatchingMap(){
  const items = await fetchContinueWatching();
  continueWatchingMap = new Map(items.map(item => [item.series_id, item]));
  return continueWatchingMap;
}

// Resolved once continueWatchingMap has its first real data, same
// pattern as slidesReady below — discover.js awaits both before its
// first render of the floating bar, so it never renders empty just
// because slides happened to resolve first.
let resolveContinueWatchingReady;
const continueWatchingReady = new Promise(resolve => { resolveContinueWatchingReady = resolve; });

// Real per-episode lock check — a real episode number past the series'
// own real free_episode_count is locked, unless its real id has already
// been fake-unlocked (coins) this session, or Free Mode (app_settings,
// see loadAppSettings above) is genuinely on — the series' own real
// free_episode_count is never touched either way, only this decision
// ignores it while Free Mode is on, exactly as if every episode were
// within it. Exactly the same rule the desktop watch page's own grid
// already uses (watch.js's watchFreeCount/watchEpCardHtml) — this is
// the one real source for it on mobile too, not a second version of
// the same check.
function isEpisodeLocked(s, ep){
  if(appSettings.free_mode_enabled) return false;
  return ep.episode_number > (s.freeEpisodeCount || 0) && !s.unlockedEpisodeIds.has(ep.id);
}

// Moves slide s to real episode ep as its current position — used by
// entering watching, in-series swipe navigation, and the jump grid
// alike, so all three ever do this exactly one way. Never sets a real
// bunnyVideoId for a locked episode (renderMedia's own honest "no video
// yet" static-art fallback handles that instead of ever actually
// playing it) — s.locked/s.lockedEpisode are what the real unlock
// prompt (unlockBtn) reads to know what it's actually prompting for.
function setActiveEpisode(s, ep){
  const locked = isEpisodeLocked(s, ep);
  s.currentEp = ep.episode_number;
  s.episodeId = ep.id;
  s.epBadge = 'EP ' + ep.episode_number + ' · ' + s.totalEp;
  s.locked = locked;
  s.lockedEpisode = locked ? ep : null;
  s.bunnyVideoId = locked ? null : (ep.bunny_video_id || null);
}

// Used by discover.js: open a specific series (by its index in `slides`)
// — every poster/hero/shelf/search-result tap, and the floating bar's
// own Continue button, all funnel through this one function. On desktop
// this opens the dedicated watch page (watch.js) instead of the mobile
// swipe feed. matchesMedia mirrors the exact 900px breakpoint styles.css
// uses everywhere else, not a separate cutoff.
async function openSeriesInFeed(i){
  const slide = slides[i];
  const resume = slide ? continueWatchingMap.get(slide.id) : null;

  if(window.matchMedia('(min-width: 900px)').matches){
    openWatchScreen(i, resume ? { episodeId: resume.episode_id, positionSeconds: resume.position_seconds } : null);
    return;
  }
  await enterMobileWatching(i, resume);
}

// The one general mechanism for a series actually entering its watching
// state on mobile — a normal tap, Continue Watching's resume, and a
// swipe rolling forward off the real end of the previous series (see
// advanceForward) all funnel through this, rather than the old one-off
// "guess whether the resume lands on the first episode or fetch that
// one episode specially" workaround this replaced. Fetches this one
// series' real, full episode list via fetchEpisodesForSeries (the same
// one real source the desktop watch page and admin panel already use),
// once — guarded by episodesLoaded so re-entering the same series later
// this session (tapping it again, resuming again) never re-fetches.
async function enterMobileWatching(i, resume){
  const slide = slides[i];
  if(!slide) return;
  pendingResumeEpisodeId = null;

  if(!slide.episodesLoaded){
    const episodes = await fetchEpisodesForSeries(slide.id);
    slide.episodes = episodes;
    slide.episodesLoaded = true;
  }
  if(!slide.episodes.length) return; // genuinely no episodes to watch

  let targetEp = slide.episodes[0];
  let resumeSeconds = 0;
  if(resume && resume.position_seconds > 0.5){
    const resumeEp = slide.episodes.find(e => e.id === resume.episode_id);
    if(resumeEp){ targetEp = resumeEp; resumeSeconds = resume.position_seconds; }
    // Saved episode no longer in this series' real list: targetEp stays
    // the real first episode, same honest fallback as no saved progress.
  }

  setActiveEpisode(slide, targetEp);
  if(resumeSeconds > 0.5 && !slide.locked){
    pendingResumeEpisodeId = slide.episodeId;
    pendingResumeSeconds = resumeSeconds;
  }

  goTo(i);
  feed.classList.add('watching');
  showChrome(); // entering an episode always starts with the real chrome group visible, even during the brief loading-art wait before promotion
  showScreen('feed');
}

// Re-checked every time Home is opened (rather than only once at
// startup) so the floating bar (see discover.js) reflects anything that
// changed since — just signed in, just watched something, just resumed
// elsewhere — instead of a stale snapshot from page load.
navHome.addEventListener('click', ()=> { showScreen('discover'); refreshContinueWatchingMap().then(renderContinueWatchingBar); });
navForYou.addEventListener('click', ()=> showScreen('feed'));
topbarHome.addEventListener('click', ()=> { showScreen('discover'); refreshContinueWatchingMap().then(renderContinueWatchingBar); });
topbarForYou.addEventListener('click', ()=> showScreen('feed'));

// Library: re-checked fresh every time the tab is opened (renderLibraryScreen,
// library.js) rather than trusting a possibly-stale snapshot from earlier
// this session — same reasoning as Home's own refreshContinueWatchingMap above.
navLibrary.addEventListener('click', ()=> { showScreen('library'); renderLibraryScreen(); });
topbarLibrary.addEventListener('click', ()=> { showScreen('library'); renderLibraryScreen(); });

// Profile: check the current Supabase Auth session each time the tab is
// opened (renderProfileScreen, defined in auth.js) rather than tracking
// it continuously — simple, and sufficient since nothing else on screen
// depends on auth state while the user is on a different tab.
navProfile.addEventListener('click', ()=> { showScreen('profile'); renderProfileScreen(); });
topbarProfile.addEventListener('click', ()=> { showScreen('profile'); renderProfileScreen(); });
topbarProfileBtn.addEventListener('click', ()=> { showScreen('profile'); renderProfileScreen(); });

// Top bar "Top Up" pill: leads to the same real Profile screen, where
// My Wallet already shows a logged-in user's actual coin balance and
// the Top Up row already has its own honest "coming soon" toast (see
// profile.js) — not a second, invented top-up flow.
topbarTopUpBtn.addEventListener('click', ()=> { showScreen('profile'); renderProfileScreen(); });

// Top bar search icon: takes over the whole nav row with a full search
// input and dims the rest of the page behind it — checked directly
// against reelshort.com's own search behaviour (see discover.js for the
// close/input/results wiring, which reuses the exact same
// searchQuery/matchesSearch logic the mobile search bar already has —
// no second search implementation). Always switches to Discover first
// since the results panel only makes visual sense over that screen.
function openTopbarSearch(){
  showScreen('discover');
  topbarDesktopInner.classList.add('search-hidden');
  topbarSearchBar.classList.add('open');
  topbarSearchBackdrop.classList.add('open');
  setTimeout(()=> topbarSearchInput.focus(), 150);
}
function closeTopbarSearch(){
  topbarDesktopInner.classList.remove('search-hidden');
  topbarSearchBar.classList.remove('open');
  topbarSearchBackdrop.classList.remove('open');
}
topbarSearchBtn.addEventListener('click', openTopbarSearch);
// Clicking anywhere on the dimmed backdrop outside the results panel
// closes search, same as clicking outside it on the real site. The
// listener is on the backdrop itself, not the panel inside it, so
// clicks on real results/inputs never bubble into a false close.
topbarSearchBackdrop.addEventListener('click', (e)=> {
  if(e.target === topbarSearchBackdrop) closeTopbarSearch();
});

function buildSpine(currentEp,totalEp){
  const count = 14;
  const filled = Math.round((currentEp/totalEp)*count);
  let html = '';
  for(let i=0;i<count;i++){
    if(i === filled){ html += '<div class="tick current"></div>'; }
    else if(i < filled){ html += '<div class="tick watched"></div>'; }
    else { html += '<div class="tick"></div>'; }
  }
  spine.innerHTML = html;
}

function setArt(art){
  if(art.type === 'img'){
    bgvideo.innerHTML = '<img src="' + art.src + '" style="width:100%;height:100%;object-fit:cover;display:block;">';
  } else {
    bgvideo.innerHTML = art.markup;
  }
}

// Keeps the real playback controls (scrub bar, speed) in lockstep with
// whether a real video is actually the thing on screen right now — art
// (locked episode, still loading) never gets scrub/speed controls
// floating uselessly over it. bgvideo's own 'has-video' class is the
// single real source of truth for this everywhere it's set.
function setBgHasVideo(hasVideo){
  bgvideo.classList.toggle('has-video', hasVideo);
  videoControls.classList.toggle('has-video', hasVideo);
}

// The real wait for a real episode's video to actually become playable
// (renderMedia below) — replaces the series' own cover image for that
// wait specifically, never used for a genuinely video-less/locked
// episode (there's nothing being waited on there, see renderMedia).
function setLoadingArt(){
  bgvideo.innerHTML = '<div class="bgvideo-loading">' + narravaLoaderHtml('pulse') + '</div>';
}

// Tears down whatever's currently the real, active video — real hls.js
// resources (its segment-loading loop, the scheduled auth-refresh
// timer), not just the DOM element, which merely removing/replacing
// #bgvideo's own content never released on its own. A no-op if nothing
// is actually playing.
function destroyActivePlayback(){
  if(currentPlaybackCtl) currentPlaybackCtl.destroy();
  currentVideoEl = null;
  currentPlaybackCtl = null;
  clearChromeHideTimer(); // never let a stale timer from the outgoing video hide the next one's chrome mid-flight
}

// Starts loading a real episode's video off-screen, in #preloadHost,
// well before it's ever shown — a real <video> element plus hls.js
// (video-player.js), already fetching its real signed URL and buffering
// real segments, so a swipe can land on an already-playing video
// instead of waiting on it cold. target is {id (real episode id),
// bunnyVideoId, seriesId} — see nextPreloadTarget. No-ops if there's
// nothing to preload or it's already in flight.
function preloadVideo(target){
  if(!target || !target.bunnyVideoId || preloadCache[target.id]) return;

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  preloadHost.appendChild(video);

  const entry = { video, ctl: null, ready: false };
  preloadCache[target.id] = entry;

  attachEpisodePlayback(video, target.id, () => onEpisodeLoadFailed(target)).then((ctl) => {
    // Preload was torn down (maintainPreload dropped it, or the whole
    // feed navigated away) before the real signed URL/hls.js setup
    // resolved — nothing left to attach this real playback to.
    if(preloadCache[target.id] !== entry) { if(ctl) ctl.destroy(); return; }
    if(!ctl){
      // The function's own real refusal (see video-player.js) — this
      // episode genuinely isn't playable right now. Never fall back to
      // anything else; just drop the preload attempt.
      delete preloadCache[target.id];
      video.remove();
      return;
    }
    entry.ctl = ctl;
    video.addEventListener('canplay', function onCanPlay(){
      video.removeEventListener('canplay', onCanPlay);
      entry.ready = true;
      // If the feed is sitting on this exact episode right now (it
      // loaded faster than the viewer swiped away), promote it
      // immediately instead of leaving it preloaded and unused.
      if(target.id === renderedMediaEpisodeId && currentVideoEl !== video) promotePreload(target);
    }, { once: true });
  });
}

// Every real bounded retry (attachEpisodePlayback, video-player.js) has
// now genuinely been exhausted for this episode — confirmed live: before
// this existed, nothing upstream ever learned a load had failed, so a
// preload that died just sat on a dead <video> forever while the loading
// spinner (or, if the viewer had already swiped to it, the same spinner
// on screen) never went anywhere. Drops the dead preload entry so the
// next time this episode is actually needed (goTo/renderMedia calling
// preloadVideo again), it gets a genuinely fresh attempt with its own
// full set of retries — never a permanently poisoned cache entry. If
// the viewer is looking at this exact episode right now, replaces the
// loading spinner with the honest failure state immediately, rather than
// leaving them staring at a spinner that's already dead underneath it.
function onEpisodeLoadFailed(target){
  const entry = preloadCache[target.id];
  if(entry){
    if(entry.ctl) entry.ctl.destroy();
    entry.video.remove();
    delete preloadCache[target.id];
  }
  if(target.id === renderedMediaEpisodeId && !currentVideoEl){
    setFailedToLoadArt(target);
  }
}

// The honest failure state in #bgvideo — real retry button wired to
// genuinely redo the whole load (preloadVideo again, from scratch, not
// just re-showing a spinner over the same dead attempt).
function setFailedToLoadArt(target){
  bgvideo.innerHTML = '<div class="bgvideo-loading">' + narravaLoadFailedHtml('bgvideoRetryBtn') + '</div>';
  document.getElementById('bgvideoRetryBtn').addEventListener('click', () => {
    setLoadingArt();
    preloadVideo(target);
  });
}

// Moves an already-warmed preload from the off-screen host into #bgvideo
// and makes it the real, active video — the "instant start" case.
// Moving a <video> element in the DOM (rather than removing/re-adding
// it, or ever touching its src) preserves its real playback/buffer
// state, so this is a genuine handoff, not a reload. target is the same
// {id, bunnyVideoId, seriesId} descriptor preloadVideo was given.
function promotePreload(target){
  const entry = preloadCache[target.id];
  if(!entry) return;
  delete preloadCache[target.id];

  destroyActivePlayback();
  bgvideo.innerHTML = '';
  setBgHasVideo(true);
  bgvideo.appendChild(entry.video);
  currentVideoEl = entry.video;
  currentPlaybackCtl = entry.ctl;
  currentVideoEpisodeId = target.id;
  currentVideoSeriesId = target.seriesId;
  attachPlaybackControls(entry.video);

  // The automatic resume's jump-back-in (see enterMobileWatching): this
  // episode's video has just genuinely become the active one for the
  // first time, so if a resume was queued for exactly this episode,
  // this is when to seek it — a real, direct, synchronous currentTime
  // assignment, already reliable the moment canplay has fired (which
  // promotion itself is gated on), no polling needed.
  if(pendingResumeEpisodeId === target.id){
    entry.video.currentTime = pendingResumeSeconds;
    pendingResumeEpisodeId = null;
  }

  // 'ended' is wired here, once, only on the video that's actually
  // becoming active — never during preload. Checking that this episode
  // is still the current one guards against a stale listener on a
  // video that's since been torn down. Advances the same real way a
  // forward swipe would (see advanceForward) — the next real episode in
  // this series while watching, or the next series while just browsing.
  entry.video.addEventListener('ended', () => {
    if(target.id !== currentVideoEpisodeId || target.id !== renderedMediaEpisodeId) return;
    advanceForward();
  });

  if(feed.classList.contains('paused')) entry.video.pause();
  else entry.video.play().catch(() => {});
}

// Wires the real scrub bar to whichever <video> just became active —
// called once per promotion (video-player.js's own instance is
// per-episode, so this re-wires fresh each time rather than trying to
// move listeners between elements).
function attachPlaybackControls(video){
  scrubRange.value = video.currentTime || 0;
  // A preloaded video (the normal case — see promotePreload) has
  // usually already buffered well past loadedmetadata by the time this
  // runs, so that event has already fired and would never come again —
  // read a real, already-known duration straight away rather than only
  // ever waiting for a future event that a fresh (non-preloaded) video
  // still genuinely needs this same listener for.
  scrubRange.max = (video.duration && isFinite(video.duration)) ? video.duration : 0;
  scrubRange.style.setProperty('--scrub-pct', '0%');

  video.addEventListener('loadedmetadata', () => {
    if(currentVideoEl !== video) return;
    scrubRange.max = video.duration || 0;
  });
  video.addEventListener('timeupdate', () => {
    if(currentVideoEl !== video || scrubbing) return;
    scrubRange.value = video.currentTime;
    const pct = video.duration ? (video.currentTime / video.duration) * 100 : 0;
    scrubRange.style.setProperty('--scrub-pct', pct + '%');
  });

  // The real chrome group (see CHROME_AUTOHIDE_MS above) always starts
  // visible the moment this episode's video actually becomes the active
  // one. Arming/clearing the 2-second auto-hide off this video's own
  // real 'playing'/'pause' events (rather than only from the tap
  // handler below) means it fires the same real way regardless of
  // *why* playback started or stopped — the initial autoplay right
  // after promotion, a tap-to-unpause, or anything else that genuinely
  // plays or pauses this video.
  showChrome();
  video.addEventListener('playing', () => {
    if(currentVideoEl !== video) return;
    armChromeHideTimer();
  });
  video.addEventListener('pause', () => {
    if(currentVideoEl !== video) return;
    clearChromeHideTimer();
    showChrome(); // a genuinely paused video never sits there with no visible way to unpause it
  });
}

// Real, draggable seeking — a real <input type=range>'s own native drag
// handling, not hand-rolled pointer math. scrubbing is set for the
// whole real drag (not just the final release) so the timeupdate
// handler above never fights the viewer's own finger mid-drag; seeking
// live on 'input' (not only on release) is what makes this a genuine
// scrub, not just a tap-to-jump.
scrubRange.addEventListener('input', () => {
  scrubbing = true;
  if(currentVideoEl) currentVideoEl.currentTime = parseFloat(scrubRange.value);
  const pct = scrubRange.max > 0 ? (scrubRange.value / scrubRange.max) * 100 : 0;
  scrubRange.style.setProperty('--scrub-pct', pct + '%');
});
scrubRange.addEventListener('change', () => { scrubbing = false; });
// Never let a drag that starts on the scrub bar reach #feed's own
// vertical swipe listeners (touchstart/touchend) — touch-action:none
// (styles.css) already stops the browser's native panning from
// interfering, but JS event bubbling is a separate concern: without
// this, the feed would still see the same touch sequence and could
// misread it as a swipe.
['touchstart', 'touchend', 'touchmove', 'pointerdown'].forEach(evt => {
  scrubRange.addEventListener(evt, e => e.stopPropagation());
});

// What to warm up next depends on which of the two real states the
// current slide is actually in: its own next real episode while
// watching, or the next series' first episode while just browsing —
// same preload mechanism either way (preloadVideo/maintainPreload never
// know or care which case produced the target), just pointed at a
// different real target.
function nextPreloadTarget(){
  const s = slides[idx];
  if(!s) return null;
  if(feed.classList.contains('watching') && s.episodesLoaded){
    const curPos = s.episodes.findIndex(e => e.id === s.episodeId);
    const nextEp = curPos !== -1 ? s.episodes[curPos + 1] : null;
    return nextEp ? { id: nextEp.id, bunnyVideoId: nextEp.bunny_video_id || null, seriesId: s.id } : null;
  }
  const nextSlide = slides[(idx + 1) % slides.length];
  return nextSlide ? { id: nextSlide.episodeId, bunnyVideoId: nextSlide.bunnyVideoId, seriesId: nextSlide.id } : null;
}

// Kicks off preloading the real next target (see nextPreloadTarget), and
// tears down any preload that's neither the current episode nor that
// next one — so there's never more than one silent, warming-up video
// sitting in the background at a time, on top of whatever's actually on
// screen.
function maintainPreload(){
  const target = nextPreloadTarget();
  if(target && target.id !== renderedMediaEpisodeId) preloadVideo(target);

  const keepIds = [renderedMediaEpisodeId, target ? target.id : null];
  Object.keys(preloadCache).forEach(id => {
    if(keepIds.indexOf(id) === -1) destroyPreloadEntry(id);
  });
}

// Tears down one off-screen preload for real — .destroy() (video-player.js)
// releases hls.js's own real resources (its segment-loading loop, the
// scheduled auth-refresh timer), not just the DOM element, and is a
// no-op if the real signed URL/hls.js setup hasn't resolved yet (that
// callback notices the cache entry is gone and cleans up itself once it
// does — see preloadVideo).
function destroyPreloadEntry(episodeId){
  const entry = preloadCache[episodeId];
  if(!entry) return;
  delete preloadCache[episodeId];
  if(entry.ctl) entry.ctl.destroy();
  entry.video.remove();
}

// Renders whichever media the current slide's real active episode
// should show. Default is always the existing static art — honest, no
// regression, identical to an episode with no video at all (including a
// real locked one, see setActiveEpisode) — and it *upgrades* to the real
// video the moment that video is actually ready, whenever that turns
// out to be: instantly if it was already preloaded, later if it just
// started loading now, or never if bunny_video_id doesn't point at a
// real video (Bunny's own 404 page for a bad id never sends a 'ready' at
// all, so this deliberately never times out and gives up — there's no
// reliable way to tell "still loading" and "genuinely broken" apart from
// out here, and wrongly giving up on a real, just-slow video would be
// worse than staying on art a little longer than strictly necessary).
//
// destroyActivePlayback (above) tears down whatever real video was
// already active — its own hls.js resources, not just the DOM element —
// so at most one *active* video is ever really running.
//
// Guarded by renderedMediaEpisodeId so re-rendering the *same* episode
// (unlocking it, tapping Continue) only updates the surrounding UI, not
// the video itself — otherwise every unrelated re-render would tear
// down and restart whatever was already playing. Keyed by the real
// episode id, not the slide/series id, since one slide can now point at
// different real episodes over time (see header comment).
function renderMedia(s){
  if(s.episodeId === renderedMediaEpisodeId) return;
  renderedMediaEpisodeId = s.episodeId;
  destroyActivePlayback();
  currentVideoEpisodeId = s.episodeId;
  currentVideoSeriesId = s.id;

  if(!s.bunnyVideoId){
    setBgHasVideo(false);
    setArt(s.art);
    maintainPreload();
    return;
  }

  const existing = preloadCache[s.episodeId];
  if(existing && existing.ready){
    promotePreload({ id: s.episodeId, bunnyVideoId: s.bunnyVideoId, seriesId: s.id });
    maintainPreload();
    return;
  }

  // Not preloaded yet (or still warming up) — a real episode's video
  // that's genuinely on its way, so this shows the real loading state
  // instead of the series' own cover image while it loads (the cover
  // image showing here was never actually honest — there IS something
  // real being waited on). preloadVideo's own 'ready' handler
  // (registered below, or already registered if `existing` is truthy)
  // promotes it — and replaces this loader with the real video — the
  // moment it's actually ready.
  setBgHasVideo(false);
  setLoadingArt();
  if(!existing) preloadVideo({ id: s.episodeId, bunnyVideoId: s.bunnyVideoId, seriesId: s.id });
  maintainPreload();
}

// Leaving the feed for any other screen must actually stop playback, not
// just hide it — destroyActivePlayback (above) is what tears down the
// video for real (see renderMedia above), so this does the same
// teardown renderMedia already does on every episode switch, just
// triggered by navigation away from the feed instead. Also clears any
// off-screen preload in flight, since those are real videos quietly
// loading too.
// renderedMediaEpisodeId is reset to null so coming back to the feed
// re-renders its media from scratch via the normal render() path,
// instead of render() thinking the current episode's video is already
// showing.
function stopFeedPlayback(){
  if(renderedMediaEpisodeId === null && Object.keys(preloadCache).length === 0) return;
  saveCurrentFeedProgress();
  destroyActivePlayback();
  bgvideo.innerHTML = '';
  setBgHasVideo(false);
  currentVideoEpisodeId = null;
  currentVideoSeriesId = null;
  renderedMediaEpisodeId = null;
  Object.keys(preloadCache).forEach(destroyPreloadEntry);
}

// Reads the currently-playing episode's real position straight off the
// real <video> element (never assumed/estimated) and upserts it via
// watch-progress.js. No-ops quietly if there's no real video playing
// right now. Both the real episode id AND its series id are read
// straight off currentVideoEpisodeId/currentVideoSeriesId (kept in
// lockstep wherever they're set — see renderMedia/promotePreload)
// rather than looked up from `slides` by id here: the slide that
// episode belongs to may already have moved on to a different real
// episode by the time this runs (real in-series swiping makes that a
// normal, frequent case now, not just a rare race), so searching
// `slides` for it could silently find nothing, or worse, the slide's
// now-different current episode. Called periodically, on pause, and
// whenever the feed leaves the current episode (goTo, stopFeedPlayback,
// in-series navigation).
function saveCurrentFeedProgress(){
  if(!currentVideoEl || !currentVideoEpisodeId || !currentVideoSeriesId) return;
  saveWatchProgress(currentVideoEpisodeId, currentVideoSeriesId, currentVideoEl.currentTime);
}

// 15s: frequent enough that a crash/refresh never loses more than a few
// seconds of real progress, infrequent enough not to spam the DB with
// upserts for something the user isn't actively pausing/leaving anyway.
setInterval(saveCurrentFeedProgress, 15000);

function renderEmptyFeed(){
  destroyActivePlayback();
  bgvideo.innerHTML = '';
  setBgHasVideo(false);
  currentVideoEpisodeId = null;
  currentVideoSeriesId = null;
  renderedMediaEpisodeId = null;
  Object.keys(preloadCache).forEach(destroyPreloadEntry);
  spine.innerHTML = '';
  pager.innerHTML = '';
  epBadge.textContent = '';
  coinBalance.textContent = coins;
  ctaRow.classList.add('hidden');

  // "No series available" is a real, honest statement only once
  // fetchSlides() has actually come back empty — while it's still in
  // flight (slidesLoaded false), this was wrongly showing that same
  // permanent-sounding message during what's actually just a real,
  // temporary wait on real data. The loading state replaces the title/
  // synopsis area for that wait instead.
  if(slidesLoaded){
    titleEl.innerHTML = 'No series available right now';
    synopsisEl.innerHTML = '';
    synopsisEl.textContent = 'Please check back soon.';
  } else {
    titleEl.innerHTML = '';
    synopsisEl.innerHTML = narravaLoaderHtml('pulse', 'Loading Narrava…');
  }
}

function render(){
  if(slides.length === 0){
    renderEmptyFeed();
    return;
  }
  ctaRow.classList.remove('hidden');

  const s = slides[idx];
  // Only actually load/play media while the feed is the visible screen.
  // render() also runs at startup (init(), before the user has ever
  // navigated anywhere — Discover is the default screen) and gets
  // called by like/save/unlock while already on the feed; in both of
  // those cases skipping this is either correct (startup: nothing
  // should be preloading or playing yet) or a harmless no-op
  // (renderMedia is itself guarded against re-running for a slide
  // that's already loaded). Without this, a fresh page load on
  // Discover was creating a real Bunny iframe and promoting it into
  // #bgvideo — invisible (the feed is display:none) but still actually
  // playing — never something a shelf poster caused, purely this
  // startup path running before any navigation happened.
  if(!feed.classList.contains('screen-hidden')) renderMedia(s);
  epBadge.textContent = s.epBadge;
  titleEl.innerHTML = s.title.replace('\n','<br>');
  synopsisEl.textContent = s.synopsis;
  likeCount.textContent = s.likes;
  likeBtn.classList.toggle('liked', s.liked);
  bookmarkBtn.classList.toggle('saved', s.saved);
  commentCount.textContent = s.commentCount;
  if(!s.socialLoaded) loadFeedSocialState(s);
  coinBalance.textContent = coins;
  buildSpine(s.currentEp, s.totalEp);

  // The real unlock prompt — shown whenever the episode actually being
  // looked at right now (browsing preview, or wherever watching/
  // swiping/the jump grid landed) is genuinely locked, targeting that
  // exact real episode. Nothing to prompt once it isn't, so it just
  // hides rather than switching to some "already unlocked" cosmetic
  // state (see unlockBtn's own click handler for the actual spend).
  if(s.locked && s.lockedEpisode){
    unlockBtn.classList.remove('hidden');
    unlockLabel.textContent = 'Unlock Ep ' + s.lockedEpisode.episode_number + ' · ' + s.coinCost + ' coin' + (s.coinCost===1?'':'s');
  } else {
    unlockBtn.classList.add('hidden');
  }

  Array.from(pager.children).forEach((d,i)=>d.classList.toggle('active', i===idx));
}

// Real like count + this viewer's own liked/saved state (social.js),
// fetched once per slide — not on every render() call, which happens
// often (every swipe, every unlock) — and guarded by s.socialLoaded so
// a second render() before this resolves doesn't kick off a duplicate
// fetch. Applied to the DOM only if this slide is still the current one
// by the time it resolves, so a fetch from a slide already swiped away
// from never overwrites whatever's actually on screen now.
async function loadFeedSocialState(s){
  s.socialLoaded = true;
  const state = await fetchSeriesSocialState(s.id);
  s.likes = state.likeCount;
  s.liked = state.liked;
  s.saved = state.saved;
  s.commentCount = state.commentCount;
  if(slides[idx] === s){
    likeCount.textContent = s.likes;
    likeBtn.classList.toggle('liked', s.liked);
    bookmarkBtn.classList.toggle('saved', s.saved);
    commentCount.textContent = s.commentCount;
  }
}

// Scrolling/swiping to a (possibly new) slide always lands back in the
// default browsing state — overlay visible, autoplaying, not paused —
// even if the slide you're leaving was in watching or paused. This is
// pure series-to-series navigation (pager dots, a browsing swipe/wheel
// tick) — callers that want to land directly in watching
// (enterMobileWatching) explicitly add that back right after calling
// this, same as before.
function goTo(i){
  if(slides.length === 0) return;
  saveCurrentFeedProgress();
  idx = (i + slides.length) % slides.length;
  feed.classList.remove('watching');
  feed.classList.remove('paused');
  render();
}

// A manual navigation always supersedes any still-pending automatic
// resume seek (see enterMobileWatching/promotePreload) — without this,
// swiping away and later swiping back onto the same episode could replay
// a stale resume-seek the viewer never asked for this time.
function clearPendingResume(){
  pendingResumeEpisodeId = null;
}

// Moves the CURRENTLY WATCHED slide to a different one of its own real
// episodes — idx/pager/the "watching" state itself never change, only
// which of this series' real episodes is active. Used by in-series
// swipe navigation and the jump grid alike. If ep is locked, this never
// plays it — setActiveEpisode leaves it showing the same real unlock
// prompt (unlockBtn) every other locked episode in this app already
// uses, not a new one.
function goToEpisodeInSlide(s, ep){
  clearPendingResume();
  setActiveEpisode(s, ep);
  render();
}

// The one real "move forward" action — used by a forward swipe/wheel
// tick AND by a video actually finishing (see promotePreload's 'ended'
// handling), so both do exactly the same real thing. While actually
// watching a series with its real episode list already loaded, this
// moves to its next real episode, or — once genuinely past the last
// one — rolls straight into the next series' own watching state at its
// first episode (never back to browsing, same continuous feel). While
// just browsing, it's plain series-to-series navigation, unchanged.
function advanceForward(){
  const s = slides[idx];
  if(feed.classList.contains('watching') && s && s.episodesLoaded){
    const curPos = s.episodes.findIndex(e => e.id === s.episodeId);
    if(curPos === -1) return;
    if(curPos + 1 < s.episodes.length){
      goToEpisodeInSlide(s, s.episodes[curPos + 1]);
    } else {
      enterMobileWatching((idx + 1) % slides.length, null);
    }
    return;
  }
  clearPendingResume();
  goTo(idx + 1);
}

// The mirror of advanceForward for a backward swipe/wheel tick. While
// watching, this stops dead at the real episode one — no wrapping
// around to a previous series — rather than doing anything at all past
// that point.
function advanceBackward(){
  const s = slides[idx];
  if(feed.classList.contains('watching') && s && s.episodesLoaded){
    const curPos = s.episodes.findIndex(e => e.id === s.episodeId);
    if(curPos <= 0) return; // already at episode one — stays put
    goToEpisodeInSlide(s, s.episodes[curPos - 1]);
    return;
  }
  clearPendingResume();
  goTo(idx - 1);
}

pager.addEventListener('click', e=>{
  if(e.target.dataset.i !== undefined){ clearPendingResume(); goTo(parseInt(e.target.dataset.i)); }
});

let touchStartY = null;
feed.addEventListener('touchstart', e=>{ touchStartY = e.touches[0].clientY; });
feed.addEventListener('touchend', e=>{
  if(touchStartY===null) return;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if(dy < -40){ advanceForward(); }
  else if(dy > 40){ advanceBackward(); }
  touchStartY = null;
});
let wheelLock = false;
feed.addEventListener('wheel', e=>{
  if(wheelLock) return;
  wheelLock = true;
  if(e.deltaY > 8){ advanceForward(); }
  else if(e.deltaY < -8){ advanceBackward(); }
  setTimeout(()=>wheelLock=false, 500);
});

// The single tap target covering the whole video, with two different
// jobs depending on state:
//   - Browsing (the default): tapping commits to watching this slide —
//     the same real "enter the watching state" mechanism as tapping a
//     poster from Discover or Continue Watching (enterMobileWatching),
//     so a normal in-feed tap gets a real episode list and real resume
//     too, not just a bare CSS class flip with no episode data behind
//     it. The video keeps playing exactly as it was, untouched, if
//     there's no saved progress to resume from.
//   - Watching: a real tap either reveals the real chrome group or
//     toggles play/pause, depending on whether that group is already
//     showing (see the CHROME_AUTOHIDE_MS comment above for the full
//     real sequence) — and press-and-hold anywhere on the video is
//     real, temporary 2x, a separate, untouched mechanic (see
//     HOLD_SPEED). Neither ever brings the browsing overlay itself
//     back — that only happens by swiping/scrolling to a new slide
//     (goTo already resets to browsing there).
playToggle.addEventListener('click', ()=>{
  if(feed.classList.contains('watching')) return; // tap/hold here now fully owned by the pointer handlers below
  if(slides.length === 0) return;
  // This shared feed also gets reused, restyled, as desktop's own
  // "For You" tab (see styles.css's body.feed-active rules) — but
  // real episode swiping/the jump grid/the real per-episode unlock
  // prompt are mobile-only (matching how openSeriesInFeed already
  // sends desktop to its own dedicated watch.js page instead of this
  // feed for the actual "watch a series" experience there). Desktop's
  // For You tab keeps its exact prior simple behavior — just commit
  // to watching, no real episode fetch — rather than this task's new
  // mechanism leaking into a screen it was never meant to touch.
  if(window.matchMedia('(min-width: 900px)').matches){
    feed.classList.add('watching');
    showChrome();
    return;
  }
  const s = slides[idx];
  enterMobileWatching(idx, continueWatchingMap.get(s.id));
});

// Real press-and-hold-to-2x, confirmed directly against reelshort.com:
// instant on press (no delay/ramp — see HOLD_SPEED above), instant back
// to normal the moment it's released, exactly wherever playback
// actually is at that instant — never a lingering faster speed. A tap
// (a press released within TAP_MAX_MS) still toggles play/pause, same
// as before, just decided here now instead of a separate 'click'
// listener, since only a real press/release pair can tell a tap and a
// hold apart. A real vertical drag (SWIPE_CANCEL_PX or more) cancels
// this read entirely — that's #feed's own forward/backward swipe
// gesture, not a tap or a hold, and must never also toggle pause or
// flash 2x on top of navigating.
playToggle.addEventListener('pointerdown', (e) => {
  if(!feed.classList.contains('watching') || !currentVideoEl) return;
  pressStartY = e.clientY;
  pressStartTime = performance.now();
  pressMoved = false;
  pressHolding = !currentVideoEl.paused;
  if(pressHolding) currentVideoEl.playbackRate = HOLD_SPEED;
});
playToggle.addEventListener('pointermove', (e) => {
  if(pressStartY === null) return;
  if(Math.abs(e.clientY - pressStartY) > SWIPE_CANCEL_PX) pressMoved = true;
});
function endPlayTogglePress(){
  if(pressStartY === null) return;
  const wasHolding = pressHolding;
  const moved = pressMoved;
  const elapsed = performance.now() - pressStartTime;
  pressStartY = null;
  pressHolding = false;
  pressMoved = false;
  if(wasHolding && currentVideoEl) currentVideoEl.playbackRate = 1; // instant, exactly where playback actually is — no seeking, no easing
  if(moved) return; // a real swipe — #feed's own touchstart/touchend already handles navigation
  if(elapsed > TAP_MAX_MS) return; // a genuine hold already did its one real job above

  // The real chrome group's own tap rule (see CHROME_AUTOHIDE_MS above):
  // a tap while hidden only ever reveals it, never touches play/pause —
  // that's the one thing that changed here. A tap while already showing
  // still does exactly what every tap here has always done: toggle
  // play/pause (the resulting real 'playing'/'pause' event is what
  // actually arms/clears the auto-hide timer — see attachPlaybackControls).
  if(feed.classList.contains('chrome-hidden')){
    showChrome();
    return;
  }
  const nowPaused = feed.classList.toggle('paused');
  if(currentVideoEl){
    if(nowPaused){
      currentVideoEl.pause();
      saveCurrentFeedProgress();
    } else {
      currentVideoEl.play().catch(() => {});
    }
  }
}
playToggle.addEventListener('pointerup', endPlayTogglePress);
playToggle.addEventListener('pointercancel', endPlayTogglePress);

// Real like: series_likes (social.js), not a session-only toggle. A
// signed-out tap opens the same sign-in modal every other account-gated
// action in this app already uses (toggleSeriesLike's own job) instead
// of silently doing nothing — returns null in that case, so the button
// is left exactly as it was rather than flipping to a state that didn't
// really happen. The count is re-fetched for real after a successful
// toggle rather than guessed locally, so it can never drift from what's
// actually in the database.
likeBtn.addEventListener('click', async ()=>{
  if(slides.length === 0) return;
  const s = slides[idx];
  const newLiked = await toggleSeriesLike(s.id, s.liked);
  if(newLiked === null) return;
  s.liked = newLiked;
  s.likes = await fetchSeriesLikeCount(s.id);
  likeBtn.classList.add('pulse');
  setTimeout(()=>likeBtn.classList.remove('pulse'), 350);
  if(slides[idx] === s) render();
});

// Same real shape as like, against series_saves — personal only, no
// public count.
bookmarkBtn.addEventListener('click', async ()=>{
  if(slides.length === 0) return;
  const s = slides[idx];
  const newSaved = await toggleSeriesSave(s.id, s.saved);
  if(newSaved === null) return;
  s.saved = newSaved;
  bookmarkBtn.classList.add('pulse');
  setTimeout(()=>bookmarkBtn.classList.remove('pulse'), 350);
  if(slides[idx] === s) render();
});

// Real comments (comments-panel.js/social.js) in this app's existing
// bottom-sheet shell — same open/close pattern as the Get Coins sheet
// just above.
commentBtn.addEventListener('click', () => {
  if(slides.length === 0) return;
  const s = slides[idx];
  commentsSheetBackdrop.classList.add('open');
  commentsSheet.classList.add('open');
  feedCommentsController.load(s.id);
});
commentsSheetClose.addEventListener('click', () => {
  commentsSheetBackdrop.classList.remove('open');
  commentsSheet.classList.remove('open');
});
commentsSheetBackdrop.addEventListener('click', () => {
  commentsSheetBackdrop.classList.remove('open');
  commentsSheet.classList.remove('open');
});

// Real episode jump grid — same real per-episode data and honest
// free_episode_count lock rule as the desktop watch page's own grid
// (watchEpCardHtml in watch.js), in this app's existing bottom-sheet
// shell. Opened from the small "EP X · Y" badge, which stays visible
// while watching specifically so this has somewhere to open from (see
// styles.css). Tapping any cell — locked or not — closes the sheet and
// runs it through the exact same goToEpisodeInSlide a swipe would: an
// unlocked one plays for real, a locked one shows the same real unlock
// prompt as anywhere else, never a second way of deciding either.
function epgridCellHtml(s, ep){
  const locked = isEpisodeLocked(s, ep);
  const isActive = ep.id === s.episodeId;
  const lockBadge = locked
    ? '<svg class="epgrid-cell-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>'
    : '';
  return '<button type="button" class="epgrid-cell' + (isActive ? ' active' : '') + (locked ? ' locked' : '') +
    '" data-ep-id="' + ep.id + '">' + lockBadge + ep.episode_number + '</button>';
}

function renderEpisodeGrid(s){
  episodeGridBody.innerHTML = s.episodes.map(ep => epgridCellHtml(s, ep)).join('');
  episodeGridBody.querySelectorAll('.epgrid-cell').forEach(btn => {
    btn.addEventListener('click', () => {
      const ep = s.episodes.find(e => e.id === btn.dataset.epId);
      if(!ep) return;
      closeEpisodeGrid();
      goToEpisodeInSlide(s, ep);
    });
  });
}

function openEpisodeGrid(){
  if(slides.length === 0) return;
  const s = slides[idx];
  if(!feed.classList.contains('watching') || !s.episodesLoaded) return;
  renderEpisodeGrid(s);
  episodeGridBackdrop.classList.add('open');
  episodeGridSheet.classList.add('open');
}
function closeEpisodeGrid(){
  episodeGridBackdrop.classList.remove('open');
  episodeGridSheet.classList.remove('open');
}
epBadge.addEventListener('click', openEpisodeGrid);
episodeGridClose.addEventListener('click', closeEpisodeGrid);
episodeGridBackdrop.addEventListener('click', closeEpisodeGrid);

// Real sharing (shareSeries, shared-utils.js) — the browser's own native
// share sheet where available, a small fallback popup where it isn't.
document.getElementById('shareBtn').addEventListener('click', ()=>{
  const btn = document.getElementById('shareBtn');
  btn.classList.add('pulse');
  setTimeout(()=>btn.classList.remove('pulse'), 350);
  if(slides.length === 0) return;
  shareSeries(slides[idx].title);
});

// Real "enter the watching state" trigger — the same real mechanism as
// the video's own tap target (playToggle below) and Discover/Continue
// Watching's own opens (openSeriesInFeed/enterMobileWatching), not the
// old fake progress-bump left over from the original mockup. Same
// desktop-vs-mobile split as playToggle: desktop's own "For You" tab
// keeps its simple no-episode-fetch behavior, real episode
// fetch/resume is mobile-only.
document.getElementById('continueBtn').addEventListener('click', ()=>{
  if(slides.length === 0) return;
  if(window.matchMedia('(min-width: 900px)').matches){
    feed.classList.add('watching');
    showChrome();
    return;
  }
  const s = slides[idx];
  enterMobileWatching(idx, continueWatchingMap.get(s.id));
});

// The one real unlock mechanism in this app — reused as-is (not
// reinvented) by a swipe or jump-grid tap landing on a locked episode
// (see setActiveEpisode/goToEpisodeInSlide): those just leave
// s.locked/s.lockedEpisode set to the real locked episode, and this
// button, already showing the matching real prompt (see render()), is
// what actually spends the (still fake/session-only) coins. Marks that
// real episode id as unlocked for the rest of this session and plays it
// immediately — that was the point of tapping unlock.
unlockBtn.addEventListener('click', ()=>{
  if(slides.length === 0) return;
  const s = slides[idx];
  if(!s.locked || !s.lockedEpisode) return;
  const ep = s.lockedEpisode;
  if(coins < s.coinCost){
    openSheet(true);
    return;
  }
  coins -= s.coinCost;
  s.unlockedEpisodeIds.add(ep.id);
  showToast('Unlocked Ep ' + ep.episode_number + ' ✓');
  goToEpisodeInSlide(s, ep);
});

// --- Get Coins sheet ---
function renderSheet(){
  const r = regions[region];
  document.querySelectorAll('.region-btn').forEach(b=>b.classList.toggle('active', b.dataset.region===region));

  packagesWrap.innerHTML = r.packages.map((p,i)=>
    '<button class="pkg ' + (i===selectedPkg?'active':'') + '" data-i="' + i + '">' +
      '<div class="pkg-coins">' +
        '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#E8B85C"/><circle cx="12" cy="12" r="9.3" fill="none" stroke="#C99A3E" stroke-width="1.4"/></svg>' +
        p.coins +
      '</div>' +
      (p.bonus ? '<div class="pkg-bonus">' + p.bonus + ' bonus</div>' : '<div class="pkg-bonus" style="visibility:hidden">spacer</div>') +
      '<div class="pkg-price">' + r.symbol + p.price + '</div>' +
    '</button>'
  ).join('');

  methodsWrap.innerHTML = r.methods.map((m,i)=>
    '<button class="method ' + (i===selectedMethod?'active':'') + '" data-i="' + i + '">' + m + '</button>'
  ).join('');

  Array.from(packagesWrap.children).forEach(btn=>{
    btn.addEventListener('click', ()=>{
      selectedPkg = parseInt(btn.dataset.i);
      renderSheet();
    });
  });
  Array.from(methodsWrap.children).forEach(btn=>{
    btn.addEventListener('click', ()=>{
      selectedMethod = parseInt(btn.dataset.i);
      renderSheet();
    });
  });

  const pkg = r.packages[selectedPkg];
  payBtn.textContent = 'Pay ' + r.symbol + pkg.price;
  payBtn.disabled = false;
  payBtn.classList.remove('processing');
}

function openSheet(insufficient){
  renderSheet();
  sheetBackdrop.classList.add('open');
  coinSheet.classList.add('open');
  if(insufficient){
    showToast('Not enough coins — top up below');
  }
}
function closeSheet(){
  sheetBackdrop.classList.remove('open');
  coinSheet.classList.remove('open');
}

coinsChip.addEventListener('click', ()=>openSheet(false));
sheetClose.addEventListener('click', closeSheet);
sheetBackdrop.addEventListener('click', closeSheet);

document.querySelectorAll('.region-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    region = btn.dataset.region;
    selectedPkg = 1;
    selectedMethod = 0;
    renderSheet();
  });
});

payBtn.addEventListener('click', ()=>{
  payBtn.disabled = true;
  payBtn.classList.add('processing');
  payBtn.textContent = 'Processing…';
  setTimeout(()=>{
    const r = regions[region];
    const pkg = r.packages[selectedPkg];
    coins += pkg.coins;
    closeSheet();
    render();
    showToast('+' + pkg.coins + ' coins added ✓');
  }, 900);
});

// Resolved once `slides` has been populated. discover.js awaits this
// before its first render, so the poster grid never renders empty just
// because its own (unrelated) genre queries happened to resolve first.
let resolveSlidesReady;
const slidesReady = new Promise(resolve => { resolveSlidesReady = resolve; });

async function init(){
  // Real maintenance mode check — the one thing that happens before
  // literally anything else, including the anonymous account bootstrap.
  // On, this renders the honest back-soon screen and returns — nothing
  // else in this function (or discover.js's own initDiscover, gated the
  // same real way) ever runs.
  await appSettingsReady;
  if(appSettings.maintenance_mode_enabled){
    renderMaintenanceMode();
    return;
  }

  // Real anonymous account bootstrap (watch-progress.js) — first thing
  // this app does, before slides/continue-watching are even fetched, so
  // every visitor already has a real, genuine account (anonymous or
  // not) for the rest of init and everything after it.
  await bootstrapAnonymousSession();

  // Real visit logging (visit-log.js) — once per real page load of the
  // actual consumer app, now that a real account genuinely exists to
  // attribute it to. Fire-and-forget: invisible to the viewer, so it
  // never delays real content on a slow connection.
  logPageVisit();

  const [fetchedSlides] = await Promise.all([fetchSlides(), refreshContinueWatchingMap()]);
  slides = fetchedSlides;
  slidesLoaded = true;
  pager.innerHTML = slides.map((_,i)=>'<div class="pdot ' + (i===0?'active':'') + '" data-i="' + i + '"></div>').join('');
  render();
  resolveSlidesReady();
  resolveContinueWatchingReady();
}

init();
