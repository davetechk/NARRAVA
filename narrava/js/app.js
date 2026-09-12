// app.js
//
// All the interactive behaviour of the mockup: rendering the current
// slide, swipe/wheel navigation, like/save/comment/unlock buttons, and
// the "Get Coins" sheet. Like/save/comments are real now (series_likes/
// series_saves/series_comments via social.js/comments-panel.js). Coin
// balance, unlock state and coin cost are still fake/frontend-only,
// exactly as in the original mockup.

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
let idx = 0;
let coins = 3;

// Real video playback state (Bunny's player.js).
let currentPlayer = null;        // playerjs.Player for the active, visible slide's video, or null
let currentVideoSlideId = null;  // slide.id currentPlayer belongs to
let pendingResumeSlideId = null; // slide.id the automatic resume wants seeked once its player is ready (see openSeriesInFeed/promotePreload)
let pendingResumeSeconds = 0;
let renderedMediaSlideId = null; // slide.id whose media (video or art) is currently in #bgvideo, so unrelated re-renders (unlock, continue) don't restart a playing video

// slide.id -> { iframe, player, ready } for a video warming up off-screen
// ahead of time (see preloadSlide/promotePreload). Bunny's player takes a
// genuinely long time to become interactive after an iframe first loads —
// confirmed live, well over 30 seconds is normal, not a bug — so the only
// way to make a video feel like it "just starts" is to have been loading
// it already, quietly, while the previous slide was still on screen.
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
const progressFill = document.getElementById('progressFill');
const likeCount = document.getElementById('likeCount');
const likeBtn = document.getElementById('likeBtn');
const bookmarkBtn = document.getElementById('bookmarkBtn');
const commentBtn = document.getElementById('commentBtn');
const commentsSheetBackdrop = document.getElementById('commentsSheetBackdrop');
const commentsSheet = document.getElementById('commentsSheet');
const commentsSheetClose = document.getElementById('commentsSheetClose');
const unlockBtn = document.getElementById('unlockBtn');
const unlockLabel = document.getElementById('unlockLabel');
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
const profileScreen = document.getElementById('profileScreen');
const watchScreen = document.getElementById('watchScreen');
const navHome = document.getElementById('navHome');
const navForYou = document.getElementById('navForYou');
const navProfile = document.getElementById('navProfile');
// Desktop-only top bar nav (>=900px, replaces the old left sidebar — see
// styles.css). Same destinations as navHome/navForYou/navProfile above,
// just a second set of clickable elements for the wide-screen layout;
// they call the exact same showScreen() function, no separate
// navigation logic.
const topbarHome = document.getElementById('topbarHome');
const topbarForYou = document.getElementById('topbarForYou');
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
  profileScreen.classList.toggle('screen-hidden', name !== 'profile');
  watchScreen.classList.toggle('screen-hidden', name !== 'watch');
  navHome.classList.toggle('active', name === 'discover');
  navForYou.classList.toggle('active', name === 'feed');
  navProfile.classList.toggle('active', name === 'profile');
  topbarHome.classList.toggle('active', name === 'discover');
  topbarForYou.classList.toggle('active', name === 'feed');
  topbarProfile.classList.toggle('active', name === 'profile');
  document.body.classList.toggle('discover-active', name === 'discover');
  document.body.classList.toggle('feed-active', name === 'feed');

  if(name !== 'feed'){
    stopFeedPlayback();
  } else if(slides.length && renderedMediaSlideId !== slides[idx].id){
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

// Used by discover.js: open a specific series (by its index in `slides`)
// — every poster/hero/shelf/search-result tap, and the floating bar's
// own Continue button, all funnel through this one function. On desktop
// this opens the dedicated watch page (watch.js) instead of the mobile
// swipe feed. matchesMedia mirrors the exact 900px breakpoint styles.css
// uses everywhere else, not a separate cutoff.
//
// Resuming is automatic and silent, not a separate action: if
// continueWatchingMap has saved progress for this series, that's passed
// straight into the normal open path. Desktop always resumes accurately
// (watch.js plays whichever real episode is asked for). The mobile swipe
// feed's slide only ever carries its series' first episode's video by
// default (see feed-data.js/fetchSlides) — when the saved progress is on
// that same first episode, resuming just works; when it's on a later
// episode, this fetches that one specific episode's real row (a
// targeted read, not a second episode list — see
// feed-data.js/fetchEpisodeById) and swaps the slide over to its real
// video for this one viewing, rather than silently opening episode 1.
// This is NOT general episode swiping/a jump grid on mobile — it's a
// single, resume-driven substitution of what one slide currently plays.
// The slide is always reset to its true first episode first, so a
// previous override never lingers once it no longer applies (e.g. the
// saved episode changed, or there's no saved progress at all). No saved
// progress just opens from the beginning, same as before this existed.
async function openSeriesInFeed(i){
  const slide = slides[i];
  const resume = slide ? continueWatchingMap.get(slide.id) : null;

  if(window.matchMedia('(min-width: 900px)').matches){
    openWatchScreen(i, resume ? { episodeId: resume.episode_id, positionSeconds: resume.position_seconds } : null);
    return;
  }
  if(!slide) return;
  const previousBunnyVideoId = slide.bunnyVideoId;

  slide.bunnyVideoId = slide.firstEpisodeBunnyVideoId;
  slide.episodeId = slide.firstEpisodeId;
  slide.currentEp = slide.firstEpisodeNumber;
  slide.epBadge = 'EP ' + slide.firstEpisodeNumber + ' · ' + slide.totalEp;
  pendingResumeSlideId = null;

  if(resume && resume.position_seconds > 0.5){
    if(resume.episode_id === slide.firstEpisodeId){
      pendingResumeSlideId = slide.id;
      pendingResumeSeconds = resume.position_seconds;
    } else {
      const ep = await fetchEpisodeById(resume.episode_id);
      if(ep && ep.bunny_video_id && ep.series_id === slide.id){
        slide.bunnyVideoId = ep.bunny_video_id;
        slide.episodeId = ep.id;
        slide.currentEp = ep.episode_number;
        slide.epBadge = 'EP ' + ep.episode_number + ' · ' + slide.totalEp;
        pendingResumeSlideId = slide.id;
        pendingResumeSeconds = resume.position_seconds;
      }
      // Fetch failed, or came back without a real video: slide already
      // stands reset to the real first episode above — opens honestly
      // from there instead of a half-applied mismatched state.
    }
  }

  // preloadCache is keyed by slide.id, not by which video it's actually
  // holding — a preload warmed before this slide's effective video
  // changed (either overridden above, or reset back off an earlier
  // override) would otherwise be reused as-is by renderMedia/
  // preloadSlide. Torn down here whenever the effective video actually
  // changed, so the next preload/render genuinely loads the right one.
  // Also clears renderedMediaSlideId's short-circuit for the rare case
  // this exact slide was already the one on screen, so the swap isn't
  // silently skipped.
  if(slide.bunnyVideoId !== previousBunnyVideoId){
    const stalePreload = preloadCache[slide.id];
    if(stalePreload){
      stalePreload.iframe.remove();
      delete preloadCache[slide.id];
    }
    if(renderedMediaSlideId === slide.id) renderedMediaSlideId = null;
  }

  goTo(i);
  feed.classList.add('watching');
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

function bunnyEmbedSrc(bunnyVideoId){
  // No loop=true: a looped <video> never fires a real 'ended' event per
  // the HTML5 spec, which would silently break auto-advance-on-finish.
  // Playing once and advancing to the next slide (real content) is also
  // just the better behavior here than looping the same clip forever.
  return 'https://iframe.mediadelivery.net/embed/' + BUNNY_LIBRARY_ID + '/' + bunnyVideoId +
    '?autoplay=true&muted=true&preload=true&responsive=false';
}

// Starts loading a slide's video off-screen, in .preload-host, well
// before it's ever shown — confirmed live that Bunny's player can take
// 30+ seconds to become interactive after its iframe first loads, so
// preloading during the *previous* slide's viewing time is the only
// realistic way for a swipe to ever land on an already-playing video.
// No-ops if there's nothing to preload or it's already in flight.
function preloadSlide(s){
  if(!s || !s.bunnyVideoId || preloadCache[s.id]) return;

  const iframe = document.createElement('iframe');
  iframe.src = bunnyEmbedSrc(s.bunnyVideoId);
  iframe.setAttribute('allow', 'autoplay');
  preloadHost.appendChild(iframe);

  const entry = { iframe, player: null, ready: false };
  preloadCache[s.id] = entry;

  const player = new playerjs.Player(iframe);
  entry.player = player;

  player.on('ready', () => {
    // Confirmed live: player.js's "ready" broadcast isn't reliably
    // scoped to the one iframe it actually came from once more than one
    // Player() instance exists on the page at a time (exactly what
    // preloading needs) — a real video's genuine ready broadcast was
    // observed firing this *other*, unrelated preload's 'ready'
    // callback too. player.isReady, set only by player.js's own
    // internal src-matched handling, is the one place that check is
    // still done correctly — so re-check it here rather than trusting
    // that this callback firing means *this* video is actually ready.
    if(!player.isReady) return;
    entry.ready = true;
    // If the feed is sitting on this exact slide right now (it loaded
    // faster than the viewer swiped away), promote it immediately
    // instead of leaving it preloaded and unused. Checked against
    // currentPlayer itself (this exact instance), not currentVideoSlideId
    // — that gets set to the new slide's id as soon as navigation
    // happens, before any promotion, so comparing slide ids here would
    // wrongly conclude "already promoted" the instant you arrive.
    if(s.id === renderedMediaSlideId && currentPlayer !== player) promotePreload(s);
  });
}

// The automatic resume's seek (see promotePreload/openSeriesInFeed).
// player.js's 'ready'/promotion only means the postMessage bridge to the
// iframe is up — not that the underlying video's own duration/seekable
// range has loaded. Confirmed live (desktop watch page, same player.js
// library): calling setCurrentTime that early is silently ignored.
// Polling getDuration until it reports a real value is necessary, but
// confirmed live NOT sufficient on its own: a duration being known
// doesn't always mean the seek sticks the instant it's called (seen
// live — currentTime stayed put after setCurrentTime, then a second
// call moments later landed instantly). So this verifies the seek
// actually took, and retries the same way (not a fresh getDuration
// poll) if it didn't, rather than assuming success from one blind call.
// Gives up after ~10s of duration-polling rather than looping forever
// if a duration genuinely never arrives.
function seekWhenSeekable(player, slideId, seconds, attemptsLeft){
  if(currentVideoSlideId !== slideId || currentPlayer !== player) return; // navigated away
  player.getDuration((duration) => {
    if(currentVideoSlideId !== slideId || currentPlayer !== player) return;
    if(duration && duration > 0){
      player.setCurrentTime(seconds);
      setTimeout(() => {
        if(currentVideoSlideId !== slideId || currentPlayer !== player) return;
        player.getCurrentTime((landedAt) => {
          if(currentVideoSlideId !== slideId || currentPlayer !== player) return;
          if(Math.abs(landedAt - seconds) > 2 && attemptsLeft > 0){
            seekWhenSeekable(player, slideId, seconds, attemptsLeft - 1);
          }
        });
      }, 300);
      return;
    }
    if(attemptsLeft <= 0) return;
    setTimeout(() => seekWhenSeekable(player, slideId, seconds, attemptsLeft - 1), 400);
  });
}

// Moves an already-warmed preload from the off-screen host into #bgvideo
// and makes it the real, controlling player — the "instant start" case.
function promotePreload(s){
  const entry = preloadCache[s.id];
  if(!entry) return;
  delete preloadCache[s.id];

  bgvideo.innerHTML = '';
  bgvideo.classList.add('has-video');
  bgvideo.appendChild(entry.iframe);
  currentPlayer = entry.player;
  currentVideoSlideId = s.id;

  // The automatic resume's jump-back-in (see openSeriesInFeed):
  // this slide's video has just genuinely become the active player for
  // the first time, so if a resume was queued for exactly this slide,
  // this is when to seek it. Confirmed live (see watch.js's
  // seekWhenSeekable) that calling setCurrentTime this early — right as
  // the player becomes active — is silently ignored: 'ready'/promotion
  // only means the postMessage bridge is up, not that the video's own
  // duration/seekable range has loaded. Polling getDuration first is
  // what's actually confirmed to make the seek stick.
  if(pendingResumeSlideId === s.id){
    const resumeSeconds = pendingResumeSeconds;
    pendingResumeSlideId = null;
    seekWhenSeekable(entry.player, s.id, resumeSeconds, 25);
  }

  // 'ended' is wired here, once, only on the player that's actually
  // becoming active — never during preload. Guards against the same
  // cross-instance broadcast issue as the isReady check above (a
  // previously-active, now-stale player's own lingering registration
  // firing on someone else's real 'ended'): checking that *this* slide
  // is still the current one is enough, since a stale instance belongs
  // to a slide that's no longer current by the time it could fire.
  // (An earlier version also re-confirmed via getDuration/getCurrentTime
  // before advancing — cut after live testing showed the player's own
  // reported currentTime can already have moved on by the time that
  // round-trip resolves, which silently swallowed the real 'ended'.)
  entry.player.on('ended', () => {
    if(s.id !== currentVideoSlideId || s.id !== renderedMediaSlideId) return;
    goTo(idx + 1);
  });

  // A short clip can finish playing during Bunny's own (often 30+
  // second, confirmed live) startup delay, entirely before the 'ended'
  // listener above ever existed to catch it — checked once, right here,
  // since that real gap only matters for a clip shorter than the
  // startup delay itself, not for genuine episode-length video.
  entry.player.getDuration((duration) => {
    entry.player.getCurrentTime((current) => {
      if(s.id !== currentVideoSlideId || s.id !== renderedMediaSlideId) return;
      if(duration && current >= duration - 0.5) goTo(idx + 1);
    });
  });

  if(feed.classList.contains('paused')) entry.player.pause();
  else entry.player.play();
}

// Kicks off preloading the slide after the current one, and tears down
// any preload that's neither the current slide nor that next one — so
// there's never more than one silent, warming-up video sitting in the
// background at a time, on top of whatever's actually on screen.
function maintainPreload(){
  const nextSlide = slides[(idx + 1) % slides.length];
  if(nextSlide && nextSlide.id !== renderedMediaSlideId) preloadSlide(nextSlide);

  const keepIds = [renderedMediaSlideId, nextSlide ? nextSlide.id : null];
  Object.keys(preloadCache).forEach(id => {
    if(keepIds.indexOf(id) === -1){
      preloadCache[id].iframe.remove();
      delete preloadCache[id];
    }
  });
}

// Renders whichever media the current slide should show. Default is
// always the existing static art — honest, no regression, identical to
// a slide with no video at all — and it *upgrades* to the real video
// the moment that video is actually ready, whenever that turns out to
// be: instantly if it was already preloaded, later if it just started
// loading now, or never if bunny_video_id doesn't point at a real video
// (Bunny's own 404 page for a bad id never sends a 'ready' at all, so
// this deliberately never times out and gives up — there's no reliable
// way to tell "still loading" and "genuinely broken" apart from out
// here, and wrongly giving up on a real, just-slow video would be worse
// than staying on art a little longer than strictly necessary).
//
// Replacing #bgvideo's content removes any iframe that was already
// inside it, and removing an iframe from the DOM is what actually stops
// its video — the browser tears down the whole embedded document, not
// just hides it — so at most one *active* video is ever playing,
// without needing to explicitly ask the old player to pause first.
//
// Guarded by renderedMediaSlideId so re-rendering the *same* slide
// (unlocking an episode, tapping Continue) only updates the surrounding
// UI, not the video itself — otherwise every unrelated re-render would
// tear down and restart whatever was already playing.
function renderMedia(s){
  if(s.id === renderedMediaSlideId) return;
  renderedMediaSlideId = s.id;
  currentPlayer = null;
  currentVideoSlideId = s.id;

  if(!s.bunnyVideoId){
    bgvideo.classList.remove('has-video');
    setArt(s.art);
    maintainPreload();
    return;
  }

  const existing = preloadCache[s.id];
  if(existing && existing.ready){
    promotePreload(s);
    maintainPreload();
    return;
  }

  // Not preloaded yet (or still warming up) — show the same static art
  // a video-less slide would, and let preloadSlide's own 'ready' handler
  // (registered below, or already registered if `existing` is truthy)
  // promote it the moment it's actually ready.
  bgvideo.classList.remove('has-video');
  setArt(s.art);
  if(!existing) preloadSlide(s);
  maintainPreload();
}

// Leaving the feed for any other screen must actually stop playback, not
// just hide it — removing #bgvideo's iframe is what tears down the video
// (see renderMedia above), so this does the same teardown renderMedia
// already does on every slide switch, just triggered by navigation away
// from the feed instead. Also clears any off-screen preload in flight,
// since those are real videos quietly loading too. renderedMediaSlideId
// is reset to null so coming back to the feed re-renders its media from
// scratch via the normal render() path, instead of render() thinking the
// current slide's video is already showing.
function stopFeedPlayback(){
  if(renderedMediaSlideId === null && Object.keys(preloadCache).length === 0) return;
  saveCurrentFeedProgress();
  bgvideo.innerHTML = '';
  bgvideo.classList.remove('has-video');
  currentPlayer = null;
  currentVideoSlideId = null;
  renderedMediaSlideId = null;
  Object.keys(preloadCache).forEach(id => { preloadCache[id].iframe.remove(); delete preloadCache[id]; });
}

// Reads the currently-playing slide's real position from its actual
// player (never assumed/estimated) and upserts it via watch-progress.js.
// No-ops quietly if there's no real video playing right now, or the
// slide has no episodeId (e.g. bunny_video_id was never set) — same
// silent-no-op-when-signed-out behavior lives in saveWatchProgress
// itself. Called periodically, on pause, and whenever the feed leaves
// the current slide/episode (goTo, stopFeedPlayback).
function saveCurrentFeedProgress(){
  if(!currentPlayer || !currentVideoSlideId) return;
  const s = slides.find(sl => sl.id === currentVideoSlideId);
  if(!s || !s.episodeId) return;
  const player = currentPlayer;
  const slideId = s.id;
  player.getCurrentTime((seconds) => {
    // A stale callback can land after the slide/player has already
    // moved on (e.g. a fast swipe right after this fired) — recheck
    // before writing so a leftover read never overwrites newer progress.
    if(currentPlayer !== player || currentVideoSlideId !== slideId) return;
    saveWatchProgress(s.episodeId, s.id, seconds);
  });
}

// 15s: frequent enough that a crash/refresh never loses more than a few
// seconds of real progress, infrequent enough not to spam the DB with
// upserts for something the user isn't actively pausing/leaving anyway.
setInterval(saveCurrentFeedProgress, 15000);

function renderEmptyFeed(){
  bgvideo.innerHTML = '';
  bgvideo.classList.remove('has-video');
  currentPlayer = null;
  currentVideoSlideId = null;
  renderedMediaSlideId = null;
  Object.keys(preloadCache).forEach(id => { preloadCache[id].iframe.remove(); delete preloadCache[id]; });
  spine.innerHTML = '';
  pager.innerHTML = '';
  epBadge.textContent = '';
  titleEl.innerHTML = 'No series available right now';
  synopsisEl.textContent = 'Please check back soon.';
  progressFill.style.width = '0%';
  coinBalance.textContent = coins;
  ctaRow.classList.add('hidden');
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
  progressFill.style.width = s.progress + '%';
  likeCount.textContent = s.likes;
  likeBtn.classList.toggle('liked', s.liked);
  bookmarkBtn.classList.toggle('saved', s.saved);
  if(!s.socialLoaded) loadFeedSocialState(s);
  coinBalance.textContent = coins;
  buildSpine(s.currentEp, s.totalEp);

  if(s.unlocked){
    unlockBtn.classList.add('unlocked');
    unlockLabel.textContent = '▶ Ep ' + s.nextEp + ' unlocked';
  } else {
    unlockBtn.classList.remove('unlocked');
    unlockLabel.textContent = 'Unlock Ep ' + s.nextEp + ' · ' + s.coinCost + ' coin' + (s.coinCost===1?'':'s');
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
  if(slides[idx] === s){
    likeCount.textContent = s.likes;
    likeBtn.classList.toggle('liked', s.liked);
    bookmarkBtn.classList.toggle('saved', s.saved);
  }
}

// Scrolling/swiping to a (possibly new) slide always lands back in the
// default browsing state — overlay visible, autoplaying, not paused —
// even if the slide you're leaving was in watching or paused. Callers
// that want to land directly in watching (openSeriesInFeed) explicitly
// add that back right after calling this.
function goTo(i){
  if(slides.length === 0) return;
  saveCurrentFeedProgress();
  idx = (i + slides.length) % slides.length;
  feed.classList.remove('watching');
  feed.classList.remove('paused');
  render();
}

// A manual navigation always supersedes any still-pending automatic
// resume seek (see openSeriesInFeed/promotePreload) — without this,
// swiping away and later swiping back onto the same slide could replay
// a stale resume-seek the viewer never asked for this time.
function clearPendingResume(){
  pendingResumeSlideId = null;
}

pager.addEventListener('click', e=>{
  if(e.target.dataset.i !== undefined){ clearPendingResume(); goTo(parseInt(e.target.dataset.i)); }
});

let touchStartY = null;
feed.addEventListener('touchstart', e=>{ touchStartY = e.touches[0].clientY; });
feed.addEventListener('touchend', e=>{
  if(touchStartY===null) return;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if(dy < -40){ clearPendingResume(); goTo(idx+1); }
  else if(dy > 40){ clearPendingResume(); goTo(idx-1); }
  touchStartY = null;
});
let wheelLock = false;
feed.addEventListener('wheel', e=>{
  if(wheelLock) return;
  wheelLock = true;
  if(e.deltaY > 8){ clearPendingResume(); goTo(idx+1); }
  else if(e.deltaY < -8){ clearPendingResume(); goTo(idx-1); }
  setTimeout(()=>wheelLock=false, 500);
});

// The single tap target covering the whole video, with two different
// jobs depending on state:
//   - Browsing (the default): tapping commits to watching this slide —
//     the overlay clears, the video keeps playing exactly as it was,
//     untouched. It does not also pause — those are deliberately two
//     separate ideas here.
//   - Watching: tapping just controls play/pause, the same way tapping
//     a real video player normally does — it does NOT bring the overlay
//     back. That only happens by swiping/scrolling to a new slide
//     (goTo already resets to browsing there). Chosen over "tap toggles
//     the overlay back" because once committed to watching, the natural
//     next thing to want from a tap is play/pause, not to undo the
//     choice you just made — bringing the overlay back has its own,
//     already-specified trigger (leaving the slide).
playToggle.addEventListener('click', ()=>{
  if(!feed.classList.contains('watching')){
    feed.classList.add('watching');
    return;
  }
  const nowPaused = feed.classList.toggle('paused');
  if(currentPlayer){
    if(nowPaused){
      currentPlayer.pause();
      saveCurrentFeedProgress();
    } else {
      currentPlayer.play();
    }
  }
});

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

document.getElementById('shareBtn').addEventListener('click', ()=>{
  const btn = document.getElementById('shareBtn');
  btn.classList.add('pulse');
  setTimeout(()=>btn.classList.remove('pulse'), 350);
});

document.getElementById('continueBtn').addEventListener('click', ()=>{
  if(slides.length === 0) return;
  const s = slides[idx];
  s.progress = Math.min(100, s.progress + 14);
  render();
});

unlockBtn.addEventListener('click', ()=>{
  if(slides.length === 0) return;
  const s = slides[idx];
  if(s.unlocked) return;
  if(coins < s.coinCost){
    openSheet(true);
    return;
  }
  coins -= s.coinCost;
  s.unlocked = true;
  s.currentEp = s.nextEp;
  s.epBadge = 'EP ' + s.currentEp + ' · ' + s.totalEp;
  s.progress = 4;
  render();
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
  const [fetchedSlides] = await Promise.all([fetchSlides(), refreshContinueWatchingMap()]);
  slides = fetchedSlides;
  pager.innerHTML = slides.map((_,i)=>'<div class="pdot ' + (i===0?'active':'') + '" data-i="' + i + '"></div>').join('');
  render();
  resolveSlidesReady();
  resolveContinueWatchingReady();
}

init();
