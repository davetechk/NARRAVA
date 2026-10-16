// Home: search, tabs and poster grid (mobile), hero and shelves (desktop), all from `slides`

let genres = [];
let seriesGenreMap = {}; // series id -> Set of genre ids

let activeTab = 'popular';

// Rankings from get_series_rankings (sorted server-side; search never renumbers).
// 'loading' | 'ready' (rankedItems: [{ slide, rank, views }]) | 'failed'
let rankingsState = 'loading';
let rankedItems = [];
const RANKINGS_TIMEOUT_MS = 10000;
let searchQuery = '';
let selectedGenreIds = new Set();

const discoverSearchInput = document.getElementById('discoverSearchInput');
const discoverTabs = document.getElementById('discoverTabs');
const discoverBody = document.getElementById('discoverBody');
const discoverHero = document.getElementById('discoverHero');
const discoverShelves = document.getElementById('discoverShelves');
const discoverBackToShelves = document.getElementById('discoverBackToShelves');

function posterArtSrc(slide){
  return (slide.art && slide.art.type === 'img') ? slide.art.src : '';
}

// One card markup for the grid and the shelves. ranking ({ rank, views }) adds the badge.
function posterCardHtml(slide, locked, ranking){
  const src = posterArtSrc(slide);
  const img = src ? '<img src="' + escapeHtml(src) + '" alt="">' : '';
  const lock = locked
    ? '<div class="poster-lock"><svg viewBox="0 0 24 24" fill="#E8B85C"><path d="M6 10V8a6 6 0 0112 0v2h1a1 1 0 011 1v9a1 1 0 01-1 1H5a1 1 0 01-1-1v-9a1 1 0 011-1h1zm2 0h8V8a4 4 0 00-8 0v2z"/></svg></div>'
    : '';
  const rank = ranking
    ? '<div class="poster-rank-meta">' +
        '<span class="poster-rank' + (ranking.rank <= 3 ? ' top' : '') + '">' + ranking.rank + '</span>' +
        '<span class="poster-views">' + formatViews(ranking.views) + '</span>' +
      '</div>'
    : '';
  return '<div class="poster-card' + (locked ? ' locked' : '') + '" data-slide-index="' + slides.indexOf(slide) + '">' +
    img + lock + rank +
    '<div class="poster-title">' + escapeHtml(slide.title) + '</div>' +
  '</div>';
}

// "1,204 views" / "1 view"
function formatViews(n){
  const v = Number(n) || 0;
  return v.toLocaleString('en-US') + (v === 1 ? ' view' : ' views');
}

async function loadRankings(){
  try {
    // get_series_rankings needs a session: wait for the anonymous sign-in
    await slidesReady;
    const { data, error } = await withTimeout(
      supabaseClient.rpc('get_series_rankings', { result_limit: 100 }),
      RANKINGS_TIMEOUT_MS
    );
    if(error) throw error;
    if(!Array.isArray(data)) throw new Error('get_series_rankings returned no list');
    const items = [];
    data.forEach(row => {
      const slide = slides.find(s => s.id === row.series_id);
      if(!slide) return; // not loaded here: skip
      items.push({ slide, rank: items.length + 1, views: row.views });
    });
    rankedItems = items;
    rankingsState = 'ready';
  } catch(err){
    console.error('Narrava: failed to load rankings', err);
    rankedItems = [];
    rankingsState = 'failed';
  }
}

function matchesSearch(slide){
  if(!searchQuery) return true;
  return slide.title.toLowerCase().includes(searchQuery);
}

function currentTabSlides(){
  let list = slides.slice();

  if(activeTab === 'new'){
    list.sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  } else if(activeTab === 'categories' && selectedGenreIds.size > 0){
    list = list.filter(s => {
      const ids = seriesGenreMap[s.id];
      if(!ids) return false;
      for(const gid of selectedGenreIds){ if(ids.has(gid)) return true; }
      return false;
    });
  }
  // Query order, no ranking

  return list.filter(matchesSearch);
}

function renderPosterGrid(list, locked){
  if(list.length === 0){
    return '<div class="discover-empty">No series match right now.</div>';
  }
  return '<div class="poster-grid">' + list.map(s => posterCardHtml(s, locked)).join('') + '</div>';
}

// Mobile Popular layout: 2 feature cards, a 3-column grid of 9, then 2 columns
function renderPopularGrid(list, locked){
  if(list.length === 0){
    return '<div class="discover-empty">No series match right now.</div>';
  }
  const feature = list.slice(0, 2);
  const tight = list.slice(2, 11);
  const roomy = list.slice(11);

  let html = '';
  if(feature.length) html += '<div class="discover-feature-row">' + feature.map(s => posterCardHtml(s, locked)).join('') + '</div>';
  if(tight.length) html += '<div class="discover-grid-tight">' + tight.map(s => posterCardHtml(s, locked)).join('') + '</div>';
  if(roomy.length) html += '<div class="discover-grid-roomy">' + roomy.map(s => posterCardHtml(s, locked)).join('') + '</div>';
  return html;
}

// Rankings tab body; null on failure so the normal grid shows
function renderRankingsBody(){
  if(rankingsState === 'loading'){
    return '<div class="poster-grid">' + skeletonPosterGridHtml(6) + '</div>';
  }
  if(rankingsState === 'failed') return null;
  const list = rankedItems.filter(item => matchesSearch(item.slide));
  if(list.length === 0) return '<div class="discover-empty">No series match right now.</div>';
  return '<div class="poster-grid">' + list.map(item => posterCardHtml(item.slide, false, item)).join('') + '</div>';
}

function renderDiscoverBody(){
  let html = '';

  if(activeTab === 'rankings' && rankingsState === 'failed'){
    html += '<div class="discover-note">Couldn’t load rankings. Showing all series.</div>';
  }

  if(activeTab === 'categories'){
    if(genres.length === 0){
      html += '<div class="discover-note">No categories set up yet.</div>';
    } else {
      html += '<div class="genre-chips">' + genres.map(g =>
        '<button class="genre-chip' + (selectedGenreIds.has(g.id) ? ' active' : '') + '" data-genre-id="' + g.id + '">' + escapeHtml(g.name) + '</button>'
      ).join('') + '</div>';
    }
  }

  if(activeTab === 'vip') html += vipCardHtml();

  const rankingsHtml = (activeTab === 'rankings') ? renderRankingsBody() : null;
  if(rankingsHtml !== null){
    html += rankingsHtml;
  } else {
    const list = currentTabSlides();
    html += (activeTab === 'popular')
      ? renderPopularGrid(list, false)
      : renderPosterGrid(list, activeTab === 'vip');
  }

  discoverBody.innerHTML = html;

  const vipGetYearly = document.getElementById('vipGetYearlyBtn');
  if(vipGetYearly) vipGetYearly.addEventListener('click', () => openMembershipScreen());

  discoverBody.querySelectorAll('.poster-card:not(.skeleton-block)').forEach(card => {
    card.addEventListener('click', () => {
      // VIP posters: not built yet
      if(activeTab === 'vip'){ showToast('Coming soon'); return; }
      openSeriesInFeed(parseInt(card.dataset.slideIndex, 10));
    });
  });

  discoverBody.querySelectorAll('.genre-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const gid = chip.dataset.genreId;
      if(selectedGenreIds.has(gid)) selectedGenreIds.delete(gid);
      else selectedGenreIds.add(gid);
      renderDiscoverBody();
    });
  });
}

// ================= Desktop shelves =================
// New Release, Top, one per genre in use (no empty shelves)

function shelvesData(){
  const shelves = [];

  // Newest first, same as the New tab
  const newRelease = slides.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  if(newRelease.length) shelves.push({ key: 'new', title: 'New Release', items: newRelease });

  // Top: Rankings order; skeleton while loading; featured-first fallback if it failed
  if(rankingsState === 'loading'){
    shelves.push({ key: 'top', title: 'Top', loading: true, items: [] });
  } else if(rankingsState === 'ready'){
    if(rankedItems.length){
      shelves.push({ key: 'top', title: 'Top', items: rankedItems.map(item => item.slide), ranking: rankedItems });
    }
  } else {
    const top = slides.slice().sort((a, b) => {
      const af = a.featuredAt ? new Date(a.featuredAt).getTime() : 0;
      const bf = b.featuredAt ? new Date(b.featuredAt).getTime() : 0;
      return bf - af;
    });
    if(top.length){
      shelves.push({
        key: 'top',
        title: 'Top',
        caption: 'Couldn’t load views. Featured series first.',
        items: top
      });
    }
  }

  // Genres with at least one series
  genres.forEach(g => {
    const items = slides.filter(s => seriesGenreMap[s.id] && seriesGenreMap[s.id].has(g.id));
    if(items.length) shelves.push({ key: 'genre:' + g.id, title: g.name, items: items });
  });

  return shelves;
}

// Same arrows as the hero carousel
const SHELF_ARROW_LEFT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>';
const SHELF_ARROW_RIGHT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';

function shelfHtml(shelf){
  return '<div class="shelf">' +
    '<div class="shelf-head">' +
      '<div class="shelf-title-group">' +
        '<h3 class="shelf-title">' + escapeHtml(shelf.title) + '</h3>' +
        (shelf.caption ? '<span class="shelf-caption">' + shelf.caption + '</span>' : '') +
      '</div>' +
      '<button type="button" class="shelf-viewall" data-shelf-key="' + shelf.key + '">View all ›</button>' +
    '</div>' +
    '<div class="shelf-row-wrap">' +
      '<button type="button" class="shelf-arrow shelf-arrow-left hide" aria-label="Scroll left">' + SHELF_ARROW_LEFT_SVG + '</button>' +
      '<div class="shelf-row">' + (shelf.loading
        ? skeletonPosterGridHtml(5)
        : shelf.items.map((s, i) => posterCardHtml(s, false, shelf.ranking ? shelf.ranking[i] : null)).join('')) + '</div>' +
      '<button type="button" class="shelf-arrow shelf-arrow-right" aria-label="Scroll right">' + SHELF_ARROW_RIGHT_SVG + '</button>' +
    '</div>' +
  '</div>';
}

// Scroll one shelf width per click; arrows hide at the ends
function wireShelfArrows(wrap){
  const row = wrap.querySelector('.shelf-row');
  const leftBtn = wrap.querySelector('.shelf-arrow-left');
  const rightBtn = wrap.querySelector('.shelf-arrow-right');
  if(!row || !leftBtn || !rightBtn) return;

  function updateArrowVisibility(){
    const maxScroll = row.scrollWidth - row.clientWidth;
    leftBtn.classList.toggle('hide', row.scrollLeft <= 4);
    rightBtn.classList.toggle('hide', row.scrollLeft >= maxScroll - 4);
  }

  leftBtn.addEventListener('click', () => row.scrollBy({ left: -row.clientWidth * 0.8, behavior: 'smooth' }));
  rightBtn.addEventListener('click', () => row.scrollBy({ left: row.clientWidth * 0.8, behavior: 'smooth' }));
  row.addEventListener('scroll', updateArrowVisibility);
  updateArrowVisibility();
}

function renderShelves(){
  if(!discoverShelves) return;

  const shelves = shelvesData();
  discoverShelves.innerHTML = shelves.length
    ? shelves.map(shelfHtml).join('')
    : '<div class="discover-empty">No series available right now.</div>';

  discoverShelves.querySelectorAll('.poster-card:not(.skeleton-block)').forEach(card => {
    card.addEventListener('click', () => openSeriesInFeed(parseInt(card.dataset.slideIndex, 10)));
  });

  discoverShelves.querySelectorAll('.shelf-viewall').forEach(btn => {
    btn.addEventListener('click', () => expandShelf(btn.dataset.shelfKey));
  });

  discoverShelves.querySelectorAll('.shelf-row-wrap').forEach(wireShelfArrows);
}

// "View all": expand the mobile tabs+grid on the matching tab
function expandShelf(key){
  if(key === 'new'){
    activeTab = 'new';
  } else if(key === 'top'){
    activeTab = 'rankings';
  } else if(key.indexOf('genre:') === 0){
    activeTab = 'categories';
    selectedGenreIds = new Set([key.slice('genre:'.length)]);
  } else {
    activeTab = 'popular';
  }
  Array.from(discoverTabs.children).forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
  document.body.classList.add('discover-expanded');
  renderDiscoverBody();
}

if(discoverBackToShelves){
  discoverBackToShelves.addEventListener('click', () => {
    document.body.classList.remove('discover-expanded');
  });
}

// Desktop hero banner with a thumbnail filmstrip (featured_at decides what's featured)
let heroItems = [];
let activeHeroIndex = 0;
let heroAutoplayTimer = null;
const HERO_AUTOPLAY_MS = 4500;
const HERO_CARD_W = 112 + 12; // thumb width + track gap
const HERO_VISIBLE = 4;

let heroBgEl, heroTitleEl, heroTagsEl, heroDescEl, heroLeftEl, heroTrackEl;
let heroThumbEls = [];

// Up to featured_series_count featured series, newest first; one random series if none
function pickHeroItems(){
  const count = (typeof appSettings.featured_series_count === 'number' && appSettings.featured_series_count >= 0)
    ? appSettings.featured_series_count
    : 5;
  const featured = slides
    .filter(s => s.featuredAt)
    .sort((a, b) => new Date(b.featuredAt) - new Date(a.featuredAt))
    .slice(0, count);

  if(featured.length > 0) return featured;
  if(slides.length === 0) return [];
  return [ slides[Math.floor(Math.random() * slides.length)] ];
}

// Tags = genres linked to the series
function heroTagsFor(slide){
  const ids = seriesGenreMap[slide.id];
  if(!ids || ids.size === 0) return [];
  return genres.filter(g => ids.has(g.id)).map(g => g.name).slice(0, 2);
}

function updateHeroContent(i){
  const s = heroItems[i];
  heroLeftEl.style.opacity = 0;
  setTimeout(() => {
    const src = posterArtSrc(s);
    heroBgEl.style.backgroundImage = src ? "url('" + src + "')" : 'none';
    heroTitleEl.textContent = s.title;
    heroTagsEl.innerHTML = heroTagsFor(s).map(t => '<span class="hero-tag">' + escapeHtml(t) + '</span>').join('');
    heroDescEl.textContent = s.synopsis;
    heroLeftEl.style.opacity = 1;
  }, 150);
}

function scrollHeroTrackTo(i){
  let offset = i - Math.floor(HERO_VISIBLE / 2);
  offset = Math.max(0, Math.min(offset, heroItems.length - HERO_VISIBLE));
  heroTrackEl.style.transform = 'translateX(-' + (offset * HERO_CARD_W) + 'px)';
}

function setActiveHero(i){
  activeHeroIndex = i;
  heroThumbEls.forEach((el, idx) => el.classList.toggle('active', idx === i));
  updateHeroContent(i);
  scrollHeroTrackTo(i);
  if(heroAutoplayTimer) startHeroAutoplay(); // reset the countdown
}

function startHeroAutoplay(){
  stopHeroAutoplay();
  if(heroItems.length < 2) return;
  heroAutoplayTimer = setInterval(() => {
    setActiveHero((activeHeroIndex + 1) % heroItems.length);
  }, HERO_AUTOPLAY_MS);
}
function stopHeroAutoplay(){
  if(heroAutoplayTimer) clearInterval(heroAutoplayTimer);
}

function renderHero(){
  if(!discoverHero) return;

  stopHeroAutoplay();
  heroItems = pickHeroItems();
  activeHeroIndex = 0;

  if(heroItems.length === 0){
    discoverHero.innerHTML = '';
    return;
  }

  discoverHero.innerHTML =
    '<div class="discover-hero-bg" id="discoverHeroBg"></div>' +
    '<div class="discover-hero-content">' +
      '<div class="discover-hero-left" id="discoverHeroLeft">' +
        '<h2 class="hero-title" id="discoverHeroTitle"></h2>' +
        '<div class="hero-tags" id="discoverHeroTags"></div>' +
        '<p class="hero-synopsis" id="discoverHeroDesc"></p>' +
        '<button class="hero-play" type="button" id="discoverHeroPlay">▶ Watch Now</button>' +
      '</div>' +
      '<div class="hero-carousel-wrap">' +
        '<div class="hero-carousel-viewport"><div class="hero-carousel-track" id="discoverHeroTrack"></div></div>' +
        (heroItems.length > 1 ? '<button class="hero-carousel-next" type="button" id="discoverHeroNext" aria-label="Next">›</button>' : '') +
      '</div>' +
    '</div>';

  heroBgEl = document.getElementById('discoverHeroBg');
  heroTitleEl = document.getElementById('discoverHeroTitle');
  heroTagsEl = document.getElementById('discoverHeroTags');
  heroDescEl = document.getElementById('discoverHeroDesc');
  heroLeftEl = document.getElementById('discoverHeroLeft');
  heroTrackEl = document.getElementById('discoverHeroTrack');

  heroThumbEls = heroItems.map((s, i) => {
    const src = posterArtSrc(s);
    const img = src ? '<img src="' + escapeHtml(src) + '" alt="">' : '';
    const el = document.createElement('div');
    el.className = 'hero-thumb' + (i === 0 ? ' active' : '');
    el.innerHTML = img + '<div class="hero-thumb-title">' + escapeHtml(s.title) + '</div>';
    el.addEventListener('click', () => setActiveHero(i));
    heroTrackEl.appendChild(el);
    return el;
  });

  document.getElementById('discoverHeroPlay').addEventListener('click', () => {
    openSeriesInFeed(slides.indexOf(heroItems[activeHeroIndex]));
  });

  if(heroItems.length > 1){
    document.getElementById('discoverHeroNext').addEventListener('click', () => {
      setActiveHero((activeHeroIndex + 1) % heroItems.length);
    });
  }

  const carouselWrap = discoverHero.querySelector('.hero-carousel-wrap');
  carouselWrap.addEventListener('mouseenter', stopHeroAutoplay);
  carouselWrap.addEventListener('mouseleave', startHeroAutoplay);

  updateHeroContent(activeHeroIndex);
  scrollHeroTrackTo(activeHeroIndex);
  heroLeftEl.style.opacity = 1; // skip fade-in on first paint
  startHeroAutoplay();
}

// ================= VIP tab =================
// Shown while vip_section_enabled is on. VIP = active yearly plan (isVipMember).
const VIP_CROWN_SVG = '<svg viewBox="0 0 24 24" fill="#E8B85C"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z"/></svg>';

function vipCardHtml(){
  if(isVipMember()){
    return '<div class="vip-card">' + VIP_CROWN_SVG +
        '<div class="vip-card-text"><div class="vip-card-title">You’re a VIP member <span class="vip-badge">VIP</span></div></div>' +
      '</div>';
  }
  return '<div class="vip-card">' + VIP_CROWN_SVG +
      '<div class="vip-card-text"><div class="vip-card-title">VIP is for yearly members</div></div>' +
      '<button type="button" class="vip-card-btn" id="vipGetYearlyBtn">Get yearly</button>' +
    '</div>';
}

function applyVipSectionSetting(){
  const on = !!appSettings.vip_section_enabled;
  const vipTab = discoverTabs.querySelector('[data-tab="vip"]');
  if(vipTab) vipTab.hidden = !on;
  if(!on && activeTab === 'vip'){
    activeTab = 'popular';
    Array.from(discoverTabs.children).forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
  }
}

// Repaint the VIP card when status loads/changes
document.addEventListener('narrava:coins-changed', () => {
  if(activeTab === 'vip') renderDiscoverBody();
});

discoverTabs.addEventListener('click', e => {
  const btn = e.target.closest('.dtab');
  if(!btn) return;
  activeTab = btn.dataset.tab;
  Array.from(discoverTabs.children).forEach(b => b.classList.toggle('active', b === btn));
  renderDiscoverBody();
});

discoverSearchInput.addEventListener('input', () => {
  searchQuery = discoverSearchInput.value.trim().toLowerCase();
  renderDiscoverBody();
});

// Desktop: solid top bar once scrolled past the hero
discoverScreen.addEventListener('scroll', () => {
  const heroHeight = discoverHero ? discoverHero.offsetHeight : 0;
  document.body.classList.toggle('discover-scrolled', discoverScreen.scrollTop > heroHeight - 80);
});

// ================= Top bar search (desktop) =================
// Shares searchQuery and matchesSearch() with the mobile search
const topbarSearchInputWrap = document.getElementById('topbarSearchInputWrap');
const topbarSearchClear = document.getElementById('topbarSearchClear');
const topbarSearchGrid = document.getElementById('topbarSearchGrid');

// Results grid: every series before typing, filtered as they type
function searchGridCardHtml(slide){
  const src = posterArtSrc(slide);
  const img = src ? '<img src="' + escapeHtml(src) + '" alt="">' : '';
  const tags = heroTagsFor(slide);
  const tagsHtml = tags.length
    ? '<div class="search-grid-tags">' + tags.map(t => '<span class="search-grid-tag">' + escapeHtml(t) + '</span>').join('') + '</div>'
    : '';
  return '<button type="button" class="search-grid-card" data-slide-index="' + slides.indexOf(slide) + '">' +
    '<div class="search-grid-thumb">' + img + '</div>' +
    '<div class="search-grid-info">' +
      '<div class="search-grid-title">' + escapeHtml(slide.title) + '</div>' +
      tagsHtml +
    '</div>' +
  '</button>';
}

function renderTopbarSearchGrid(){
  const matches = slides.filter(matchesSearch);
  topbarSearchGrid.innerHTML = matches.length
    ? matches.map(searchGridCardHtml).join('')
    : '<div class="topbar-search-empty">No matches' + (searchQuery ? ' for "' + escapeHtml(searchQuery) + '"' : '') + '.</div>';

  topbarSearchGrid.querySelectorAll('.search-grid-card').forEach(card => {
    card.addEventListener('click', () => {
      openSeriesInFeed(parseInt(card.dataset.slideIndex, 10));
      closeTopbarSearch();
    });
  });
}

topbarSearchInput.addEventListener('input', () => {
  searchQuery = topbarSearchInput.value.trim().toLowerCase();
  topbarSearchInputWrap.classList.toggle('has-text', !!topbarSearchInput.value);
  renderTopbarSearchGrid();
  renderDiscoverBody();
});
topbarSearchClear.addEventListener('click', () => {
  topbarSearchInput.value = '';
  searchQuery = '';
  topbarSearchInputWrap.classList.remove('has-text');
  renderTopbarSearchGrid();
  renderDiscoverBody();
  topbarSearchInput.focus();
});

// ================= Mobile floating "Continue Watching" bar =================
// Most recently watched series, mobile Home only
const cwFloatEl = document.getElementById('cwFloat');

function mostRecentContinueWatchingItem(){
  let best = null;
  continueWatchingMap.forEach(item => {
    if(!best || new Date(item.updated_at) > new Date(best.updated_at)) best = item;
  });
  return best;
}

// Dismissed for this page load only
const dismissedThisPageLoad = new Set();

function renderContinueWatchingBar(){
  if(!cwFloatEl) return;

  const item = mostRecentContinueWatchingItem();
  const slide = item ? slides.find(s => s.id === item.series_id) : null;

  if(!item || !slide || dismissedThisPageLoad.has(item.series_id)){
    cwFloatEl.classList.remove('show');
    cwFloatEl.innerHTML = '';
    return;
  }

  const art = posterArtSrc(slide);
  cwFloatEl.innerHTML =
    (art ? '<img class="cw-float-thumb" src="' + escapeHtml(art) + '" alt="">' : '<div class="cw-float-thumb"></div>') +
    '<div class="cw-float-info">' +
      '<div class="cw-float-title">' + escapeHtml(slide.title) + '</div>' +
      '<div class="cw-float-ep">EP ' + item.episode_number + ' / EP ' + slide.totalEp + '</div>' +
    '</div>' +
    '<button type="button" class="cw-float-continue">Continue</button>' +
    '<button type="button" class="cw-float-close" aria-label="Dismiss">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
    '</button>';
  cwFloatEl.classList.add('show');

  cwFloatEl.querySelector('.cw-float-continue').addEventListener('click', () => {
    openSeriesInFeed(slides.indexOf(slide));
  });
  cwFloatEl.querySelector('.cw-float-close').addEventListener('click', () => {
    dismissedThisPageLoad.add(item.series_id);
    renderContinueWatchingBar();
  });
}

async function initDiscover(){
  // Maintenance on: app.js already replaced the page
  await appSettingsReady;
  if(appSettings.maintenance_mode_enabled) return;
  // Offline start: nothing to fetch
  if(appStartedOffline) return;
  applyVipSectionSetting();

  // Skeletons in whichever Home containers are visible, one shared logo
  showSkeletonLogo();
  if(discoverHero) discoverHero.innerHTML = skeletonHomeHeroHtml();
  if(discoverShelves) discoverShelves.innerHTML = skeletonHomeShelvesHtml();
  if(discoverBody) discoverBody.innerHTML = '<div class="poster-grid">' + skeletonPosterGridHtml(6) + '</div>';

  // Rankings load in parallel; tab and Top shelf re-render when settled
  const rankingsLoaded = loadRankings();

  const [genreRows, links] = await Promise.all([fetchGenres(), fetchSeriesGenres()]);
  genres = genreRows;
  links.forEach(link => {
    if(!seriesGenreMap[link.series_id]) seriesGenreMap[link.series_id] = new Set();
    seriesGenreMap[link.series_id].add(link.genre_id);
  });

  await slidesReady; // wait for slides
  renderHero();
  renderShelves();
  renderDiscoverBody();
  renderTopbarSearchGrid();
  hideSkeletonLogo();

  rankingsLoaded.then(() => {
    renderShelves();
    if(activeTab === 'rankings') renderDiscoverBody();
  });

  await continueWatchingReady; // wait for Continue Watching data
  renderContinueWatchingBar();
}

initDiscover();
