// app.js
//
// All the interactive behaviour of the mockup: rendering the current
// slide, swipe/wheel navigation, like/save/unlock buttons, and the
// "Get Coins" sheet. Coin balance, unlock state and coin cost are all
// still fake/frontend-only here, exactly as in the original mockup —
// only the slide content itself now comes from Supabase (via
// feed-data.js) instead of a hardcoded array.

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
const topbarSearchPanel = document.getElementById('topbarSearchPanel');
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
  feed.classList.toggle('screen-hidden', name !== 'feed');
  discoverScreen.classList.toggle('screen-hidden', name !== 'discover');
  profileScreen.classList.toggle('screen-hidden', name !== 'profile');
  navHome.classList.toggle('active', name === 'discover');
  navForYou.classList.toggle('active', name === 'feed');
  navProfile.classList.toggle('active', name === 'profile');
  topbarHome.classList.toggle('active', name === 'discover');
  topbarForYou.classList.toggle('active', name === 'feed');
  topbarProfile.classList.toggle('active', name === 'profile');
  document.body.classList.toggle('discover-active', name === 'discover');
  document.body.classList.toggle('feed-active', name === 'feed');
}

// Used by discover.js: open a specific series (by its index in `slides`)
// directly into its first episode in the For You feed. `goTo` already
// supports jumping to an arbitrary slide, so entering the feed from a
// poster tap reuses exactly the same navigation the feed itself uses —
// landing straight in the watching state (clean video, no overlay),
// since tapping in from Discover already means this one specifically.
function openSeriesInFeed(i){
  goTo(i);
  feed.classList.add('watching');
  showScreen('feed');
}

navHome.addEventListener('click', ()=> showScreen('discover'));
navForYou.addEventListener('click', ()=> showScreen('feed'));
topbarHome.addEventListener('click', ()=> showScreen('discover'));
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

// Top bar search icon: opens the sliding panel under the top bar
// (see discover.js for the panel's own input/results wiring, which
// reuses the exact same searchQuery/matchesSearch logic the mobile
// search bar already has — no second search implementation). Always
// switches to Discover first since the panel only makes visual sense
// over that screen's hero.
topbarSearchBtn.addEventListener('click', ()=> {
  showScreen('discover');
  const isOpen = topbarSearchPanel.classList.toggle('open');
  if(isOpen) setTimeout(()=> topbarSearchInput.focus(), 150);
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
  renderMedia(s);
  epBadge.textContent = s.epBadge;
  titleEl.innerHTML = s.title.replace('\n','<br>');
  synopsisEl.textContent = s.synopsis;
  progressFill.style.width = s.progress + '%';
  likeCount.textContent = s.likes;
  likeBtn.classList.toggle('liked', s.liked);
  bookmarkBtn.classList.toggle('saved', s.saved);
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

// Scrolling/swiping to a (possibly new) slide always lands back in the
// default browsing state — overlay visible, autoplaying, not paused —
// even if the slide you're leaving was in watching or paused. Callers
// that want to land directly in watching (openSeriesInFeed) explicitly
// add that back right after calling this.
function goTo(i){
  if(slides.length === 0) return;
  idx = (i + slides.length) % slides.length;
  feed.classList.remove('watching');
  feed.classList.remove('paused');
  render();
}

pager.addEventListener('click', e=>{
  if(e.target.dataset.i !== undefined) goTo(parseInt(e.target.dataset.i));
});

let touchStartY = null;
feed.addEventListener('touchstart', e=>{ touchStartY = e.touches[0].clientY; });
feed.addEventListener('touchend', e=>{
  if(touchStartY===null) return;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if(dy < -40) goTo(idx+1);
  else if(dy > 40) goTo(idx-1);
  touchStartY = null;
});
let wheelLock = false;
feed.addEventListener('wheel', e=>{
  if(wheelLock) return;
  wheelLock = true;
  if(e.deltaY > 8) goTo(idx+1);
  else if(e.deltaY < -8) goTo(idx-1);
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
    if(nowPaused) currentPlayer.pause();
    else currentPlayer.play();
  }
});

likeBtn.addEventListener('click', ()=>{
  if(slides.length === 0) return;
  const s = slides[idx];
  s.liked = !s.liked;
  likeBtn.classList.add('pulse');
  setTimeout(()=>likeBtn.classList.remove('pulse'), 350);
  render();
});

bookmarkBtn.addEventListener('click', ()=>{
  if(slides.length === 0) return;
  const s = slides[idx];
  s.saved = !s.saved;
  bookmarkBtn.classList.add('pulse');
  setTimeout(()=>bookmarkBtn.classList.remove('pulse'), 350);
  render();
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
  slides = await fetchSlides();
  pager.innerHTML = slides.map((_,i)=>'<div class="pdot ' + (i===0?'active':'') + '" data-i="' + i + '"></div>').join('');
  render();
  resolveSlidesReady();
}

init();
