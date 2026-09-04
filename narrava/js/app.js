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
// Desktop-only sidebar nav (>=900px, Discover screen's own layout — see
// styles.css). Same destinations as navHome/navForYou/navProfile above,
// just a second set of clickable elements for the wide-screen layout;
// they call the exact same showScreen() function, no separate
// navigation logic.
const sidebarHome = document.getElementById('sidebarHome');
const sidebarForYou = document.getElementById('sidebarForYou');
const sidebarProfile = document.getElementById('sidebarProfile');

// Screen switching between the "Home" (Discover) grid and the "For You"
// swipe feed. Both screens stay mounted and populated at all times —
// this just toggles which one is visible, so switching back to a
// screen never re-fetches or re-renders it from scratch.
//
// Also toggles `discover-active` / `feed-active` on <body>: above the
// desktop breakpoint, styles.css uses these to switch each screen into
// its own desktop layout (sidebar + grid for Discover, sidebar + centered
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
  sidebarHome.classList.toggle('active', name === 'discover');
  sidebarForYou.classList.toggle('active', name === 'feed');
  sidebarProfile.classList.toggle('active', name === 'profile');
  document.body.classList.toggle('discover-active', name === 'discover');
  document.body.classList.toggle('feed-active', name === 'feed');
}

// Used by discover.js: open a specific series (by its index in `slides`)
// directly into its first episode in the For You feed. `goTo` already
// supports jumping to an arbitrary slide, so entering the feed from a
// poster tap reuses exactly the same navigation the feed itself uses.
function openSeriesInFeed(i){
  goTo(i);
  showScreen('feed');
}

navHome.addEventListener('click', ()=> showScreen('discover'));
navForYou.addEventListener('click', ()=> showScreen('feed'));
sidebarHome.addEventListener('click', ()=> showScreen('discover'));
sidebarForYou.addEventListener('click', ()=> showScreen('feed'));

// Profile: check the current Supabase Auth session each time the tab is
// opened (renderProfileScreen, defined in auth.js) rather than tracking
// it continuously — simple, and sufficient since nothing else on screen
// depends on auth state while the user is on a different tab.
navProfile.addEventListener('click', ()=> { showScreen('profile'); renderProfileScreen(); });
sidebarProfile.addEventListener('click', ()=> { showScreen('profile'); renderProfileScreen(); });

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

function renderEmptyFeed(){
  bgvideo.innerHTML = '';
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
  setArt(s.art);
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

function goTo(i){
  if(slides.length === 0) return;
  idx = (i + slides.length) % slides.length;
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

playToggle.addEventListener('click', ()=>{
  feed.classList.toggle('paused');
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
