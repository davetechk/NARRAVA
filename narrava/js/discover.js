// discover.js
//
// The "Home" tab: search + tabs (Popular / New / Rankings / Categories /
// VIP) + a poster grid, all built from the same `slides` array app.js
// already fetches from Supabase (one entry per series, holding that
// series' first episode). No separate fetch for the grid itself — this
// file only adds two more read-only queries, for genres and the
// series<->genre links, needed by the Categories tab.
//
// Tapping a poster hands off to `openSeriesInFeed` (defined in app.js),
// which reuses the feed's existing `goTo` navigation — that pattern
// already existed, nothing new had to be invented for it.

let genres = [];
let seriesGenreMap = {}; // series id -> Set of genre ids

let activeTab = 'popular';
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

// Shared by the mobile tabs+grid below and the desktop shelves — one
// card markup, not two, so both ever look and behave identically.
function posterCardHtml(slide, locked){
  const src = posterArtSrc(slide);
  const img = src ? '<img src="' + src + '" alt="">' : '';
  const lock = locked
    ? '<div class="poster-lock"><svg viewBox="0 0 24 24" fill="#E8B85C"><path d="M6 10V8a6 6 0 0112 0v2h1a1 1 0 011 1v9a1 1 0 01-1 1H5a1 1 0 01-1-1v-9a1 1 0 011-1h1zm2 0h8V8a4 4 0 00-8 0v2z"/></svg></div>'
    : '';
  return '<div class="poster-card' + (locked ? ' locked' : '') + '" data-slide-index="' + slides.indexOf(slide) + '">' +
    img + lock +
    '<div class="poster-title">' + slide.title + '</div>' +
  '</div>';
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
  // popular, rankings, vip: whatever order the series query returned,
  // no invented ranking of any kind.

  return list.filter(matchesSearch);
}

function renderPosterGrid(list, locked){
  if(list.length === 0){
    return '<div class="discover-empty">No series match right now.</div>';
  }
  return '<div class="poster-grid">' + list.map(s => posterCardHtml(s, locked)).join('') + '</div>';
}

// Mobile-only Popular tab layout: two larger feature cards, then a tight
// 3-column grid for the next nine, then a roomier 2-column grid for
// everything after that — matches the real reference screenshots.
// Desktop is untouched: styles.css collapses all three containers back
// to the same uniform grid `.poster-grid` already uses there, so the
// desktop "View all" expanded view looks exactly as it did before.
// Naturally adapts to however many real series actually exist — with
// under 11 series (true for every series in this app today) the roomy
// tier is simply empty, nothing invented to fill it.
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

function renderDiscoverBody(){
  let html = '';

  if(activeTab === 'rankings'){
    html += '<div class="discover-note">Rankings coming soon — we don\'t track view counts yet, so this is just the full list for now.</div>';
  }

  if(activeTab === 'categories'){
    if(genres.length === 0){
      html += '<div class="discover-note">No categories set up yet.</div>';
    } else {
      html += '<div class="genre-chips">' + genres.map(g =>
        '<button class="genre-chip' + (selectedGenreIds.has(g.id) ? ' active' : '') + '" data-genre-id="' + g.id + '">' + g.name + '</button>'
      ).join('') + '</div>';
    }
  }

  const list = currentTabSlides();
  html += (activeTab === 'popular')
    ? renderPopularGrid(list, false)
    : renderPosterGrid(list, activeTab === 'vip');

  discoverBody.innerHTML = html;

  discoverBody.querySelectorAll('.poster-card').forEach(card => {
    card.addEventListener('click', () => {
      // VIP gating isn't real yet — posters in this tab are a visual
      // placeholder only, tapping them does nothing for now.
      if(activeTab === 'vip') return;
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
//
// Replaces the mobile tabs+grid on desktop with a stack of named
// horizontal shelves (New Release / Top / one per genre in use) —
// confirmed against real reelshort.com screenshots. Built entirely
// from data already loaded here (`slides`, `genres`, `seriesGenreMap`),
// no second fetch, no second "what's featured/new" concept.
//
// A genre with zero series tagged simply doesn't get a shelf — same
// honesty rule as everywhere else in this app: never render an empty
// shelf just to fill out the row of names from the reference site.

function shelvesData(){
  const shelves = [];

  // New Release: same "newest first" ordering the mobile New tab
  // already uses — not a second definition of what "new" means.
  const newRelease = slides.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  if(newRelease.length) shelves.push({ key: 'new', title: 'New Release', items: newRelease });

  // Top: there's no real view-count/watch data yet, so this is
  // deliberately NOT a popularity ranking — that would mean inventing
  // numbers. featured_at is a real, already-existing signal (an admin
  // decision, not a fabricated stat), so featured series surface first
  // and everything else keeps its normal order after that. The caption
  // says plainly that this isn't ranked by views, the same honesty
  // pattern the mobile Rankings tab already uses for this exact gap.
  const top = slides.slice().sort((a, b) => {
    const af = a.featuredAt ? new Date(a.featuredAt).getTime() : 0;
    const bf = b.featuredAt ? new Date(b.featuredAt).getTime() : 0;
    return bf - af;
  });
  if(top.length){
    shelves.push({
      key: 'top',
      title: 'Top',
      caption: 'No view-count data yet — featured series shown first, not ranked by views',
      items: top
    });
  }

  // One shelf per genre that actually has at least one series tagged.
  genres.forEach(g => {
    const items = slides.filter(s => seriesGenreMap[s.id] && seriesGenreMap[s.id].has(g.id));
    if(items.length) shelves.push({ key: 'genre:' + g.id, title: g.name, items: items });
  });

  return shelves;
}

// Same arrow markup/style as the hero carousel's own next button — see
// .shelf-arrow / body.discover-active .hero-carousel-next in styles.css.
const SHELF_ARROW_LEFT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>';
const SHELF_ARROW_RIGHT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';

function shelfHtml(shelf){
  return '<div class="shelf">' +
    '<div class="shelf-head">' +
      '<div class="shelf-title-group">' +
        '<h3 class="shelf-title">' + shelf.title + '</h3>' +
        (shelf.caption ? '<span class="shelf-caption">' + shelf.caption + '</span>' : '') +
      '</div>' +
      '<button type="button" class="shelf-viewall" data-shelf-key="' + shelf.key + '">View all ›</button>' +
    '</div>' +
    '<div class="shelf-row-wrap">' +
      '<button type="button" class="shelf-arrow shelf-arrow-left hide" aria-label="Scroll left">' + SHELF_ARROW_LEFT_SVG + '</button>' +
      '<div class="shelf-row">' + shelf.items.map(s => posterCardHtml(s, false)).join('') + '</div>' +
      '<button type="button" class="shelf-arrow shelf-arrow-right" aria-label="Scroll right">' + SHELF_ARROW_RIGHT_SVG + '</button>' +
    '</div>' +
  '</div>';
}

// One shelf's worth of cards scrolled per click — plain scrollBy, no
// second carousel mechanism invented for this (the hero filmstrip's own
// autoplay/drag logic is unrelated and untouched). Arrows hide
// themselves at whichever end there's genuinely nothing left to scroll.
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

  discoverShelves.querySelectorAll('.poster-card').forEach(card => {
    card.addEventListener('click', () => openSeriesInFeed(parseInt(card.dataset.slideIndex, 10)));
  });

  discoverShelves.querySelectorAll('.shelf-viewall').forEach(btn => {
    btn.addEventListener('click', () => expandShelf(btn.dataset.shelfKey));
  });

  discoverShelves.querySelectorAll('.shelf-row-wrap').forEach(wireShelfArrows);
}

// "View all" doesn't build a second grid — it reuses the exact same
// tabs+grid the mobile screen already has, just expanded to fill the
// desktop column in place of the shelves, with a way back. Genre
// shelves land on the existing Categories tab with that one genre
// already selected, New Release lands on the existing New tab, and Top
// — since it isn't a real ranking — lands on the plain, unranked
// Popular tab rather than implying a "top" tab that doesn't exist.
function expandShelf(key){
  if(key === 'new'){
    activeTab = 'new';
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

// Desktop-only featured banner above the tabs (hidden on mobile via
// CSS). Built from the same `slides` app.js already loaded — no extra
// fetch. `featured_at` (set via Supabase, no admin UI for it yet) is
// the only source of truth for what's featured; nothing here invents a
// second curation concept.
//
// Driven by a thumbnail filmstrip instead of arrows/dots (matching
// narrava-desktop-mockup.html): the strip is built once, then clicking
// a thumbnail (or autoplay advancing on its own) just swaps the bg
// image / title / tags / synopsis text in place — same pattern as the
// reference's renderHero(i)/setActive(i)/scrollTrackTo(i).
let heroItems = [];
let activeHeroIndex = 0;
let heroAutoplayTimer = null;
const HERO_AUTOPLAY_MS = 4500;
const HERO_CARD_W = 98 + 12; // thumb width + track gap
const HERO_VISIBLE = 5;

let heroBgEl, heroTitleEl, heroTagsEl, heroDescEl, heroLeftEl, heroTrackEl;
let heroThumbEls = [];

// Up to 3 series with a non-null featured_at, most recently featured
// first. If none are featured yet (no admin panel exists to set this),
// fall back to one random series so the hero never just goes blank.
function pickHeroItems(){
  const featured = slides
    .filter(s => s.featuredAt)
    .sort((a, b) => new Date(b.featuredAt) - new Date(a.featuredAt))
    .slice(0, 3);

  if(featured.length > 0) return featured;
  if(slides.length === 0) return [];
  return [ slides[Math.floor(Math.random() * slides.length)] ];
}

// Tags are real genres already linked to this series (seriesGenreMap,
// loaded in initDiscover below) — not the reference's invented
// "Trending"/"Female" labels. A series with no genre tagged yet simply
// shows no tags, same honesty rule as everywhere else in this app.
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
    heroTagsEl.innerHTML = heroTagsFor(s).map(t => '<span class="hero-tag">' + t + '</span>').join('');
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
  if(heroAutoplayTimer) startHeroAutoplay(); // reset countdown after any change
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
    const img = src ? '<img src="' + src + '" alt="">' : '';
    const el = document.createElement('div');
    el.className = 'hero-thumb' + (i === 0 ? ' active' : '');
    el.innerHTML = img + '<div class="hero-thumb-title">' + s.title + '</div>';
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

// Desktop: the fixed top bar fades from transparent-over-the-hero to a
// solid background once scrolled past it — one scroll listener toggling
// one body class, not a second layout. discoverScreen (the `.discover`
// element itself) is the thing that actually scrolls now (see styles.css
// body.discover-active .discover); it's already declared in app.js.
// No-ops harmlessly on mobile, where `.discover` itself never scrolls
// (the mobile tabs+grid scrolls via .discover-body instead).
discoverScreen.addEventListener('scroll', () => {
  const heroHeight = discoverHero ? discoverHero.offsetHeight : 0;
  document.body.classList.toggle('discover-scrolled', discoverScreen.scrollTop > heroHeight - 80);
});

// ================= Top bar search (desktop) =================
//
// The icon in the top bar (see app.js openTopbarSearch/closeTopbarSearch)
// takes over the whole nav row with this input and dims the page behind
// it — matching reelshort.com's own search behaviour, checked directly
// rather than assumed, rather than a small dropdown under a still-
// visible nav bar. Shares the exact same `searchQuery` state and
// `matchesSearch()` predicate as discoverSearchInput above — typing here
// also keeps the mobile/expanded-grid view in sync via the same
// renderDiscoverBody() call — this is one search implementation with two
// trigger elements, not two separate searches.
// topbarSearchInput is already declared in app.js (it wires the icon
// that opens/closes search) — reused here as-is, not redeclared.
const topbarSearchInputWrap = document.getElementById('topbarSearchInputWrap');
const topbarSearchClear = document.getElementById('topbarSearchClear');
const topbarSearchGrid = document.getElementById('topbarSearchGrid');

// A real grid of series thumbnails + titles, shown as-is before anyone
// types (matchesSearch returns true for everything on an empty query)
// and live-filtered down to real matches as they type — the same
// matchesSearch() predicate the mobile bar and Categories tab already
// use, rendered as thumbnail+title+tags rows (2 per row), matching the
// real site's own results layout. Genre tags reuse heroTagsFor (real
// seriesGenreMap links, already used by the hero) — no view counts or
// rankings, since there's no real data behind those, unlike the real
// site's own view-count/rank numbers.
function searchGridCardHtml(slide){
  const src = posterArtSrc(slide);
  const img = src ? '<img src="' + src + '" alt="">' : '';
  const tags = heroTagsFor(slide);
  const tagsHtml = tags.length
    ? '<div class="search-grid-tags">' + tags.map(t => '<span class="search-grid-tag">' + t + '</span>').join('') + '</div>'
    : '';
  return '<button type="button" class="search-grid-card" data-slide-index="' + slides.indexOf(slide) + '">' +
    '<div class="search-grid-thumb">' + img + '</div>' +
    '<div class="search-grid-info">' +
      '<div class="search-grid-title">' + slide.title + '</div>' +
      tagsHtml +
    '</div>' +
  '</button>';
}

function renderTopbarSearchGrid(){
  const matches = slides.filter(matchesSearch);
  topbarSearchGrid.innerHTML = matches.length
    ? matches.map(searchGridCardHtml).join('')
    : '<div class="topbar-search-empty">No matches' + (searchQuery ? ' for "' + searchQuery + '"' : '') + '.</div>';

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
//
// Small, fixed bar just above the bottom nav (see .cw-float in
// styles.css) — NOT part of the scrolling page, unlike the row of cards
// this replaces. Shows only the single most recently watched series
// (highest updated_at among continueWatchingMap's rows — see app.js),
// only on the mobile Home screen (CSS gates it to body.discover-active,
// and hides it outright on desktop alongside .bottomnav itself), only
// for a signed-in viewer who's actually watched something —
// get_continue_watching (untouched, see watch-progress.js) already does
// that filtering server-side, so an empty map here means exactly that,
// never "still loading".
//
// Tapping Continue reuses openSeriesInFeed (app.js) — the exact same
// silent-resume path any other poster/hero tap uses. There is no second
// resume mechanism here; this bar is only ever a shortcut into it.
const cwFloatEl = document.getElementById('cwFloat');

function mostRecentContinueWatchingItem(){
  let best = null;
  continueWatchingMap.forEach(item => {
    if(!best || new Date(item.updated_at) > new Date(best.updated_at)) best = item;
  });
  return best;
}

// Dismissing hides this one series' bar for the rest of the current
// browser session (sessionStorage, cleared when the tab/browser closes)
// — not permanently. Chosen because this bar is a convenience nudge, not
// a setting: silently suppressing it forever (e.g. a DB flag) risks it
// staying hidden long after the viewer has moved on to something else
// entirely, while "just for this visit" still respects an explicit "not
// now" without any lasting side effect. A different series becoming the
// most-recently-watched one shows its own bar regardless, since that's
// new information, not a repeat of the dismissed prompt.
function isDismissedThisSession(seriesId){
  try { return sessionStorage.getItem('cwDismissed:' + seriesId) === '1'; }
  catch(e){ return false; }
}
function dismissForThisSession(seriesId){
  try { sessionStorage.setItem('cwDismissed:' + seriesId, '1'); } catch(e){}
}

function renderContinueWatchingBar(){
  if(!cwFloatEl) return;

  const item = mostRecentContinueWatchingItem();
  const slide = item ? slides.find(s => s.id === item.series_id) : null;

  if(!item || !slide || isDismissedThisSession(item.series_id)){
    cwFloatEl.classList.remove('show');
    cwFloatEl.innerHTML = '';
    return;
  }

  const art = posterArtSrc(slide);
  cwFloatEl.innerHTML =
    (art ? '<img class="cw-float-thumb" src="' + art + '" alt="">' : '<div class="cw-float-thumb"></div>') +
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
    dismissForThisSession(item.series_id);
    renderContinueWatchingBar();
  });
}

async function initDiscover(){
  const [genreRows, links] = await Promise.all([fetchGenres(), fetchSeriesGenres()]);
  genres = genreRows;
  links.forEach(link => {
    if(!seriesGenreMap[link.series_id]) seriesGenreMap[link.series_id] = new Set();
    seriesGenreMap[link.series_id].add(link.genre_id);
  });

  await slidesReady; // app.js: don't render the grid until slides exist
  renderHero();
  renderShelves();
  renderDiscoverBody();
  renderTopbarSearchGrid(); // unfiltered by default — every real series, no invented ranking

  await continueWatchingReady; // app.js: don't render the bar until it has real data
  renderContinueWatchingBar();
}

initDiscover();
