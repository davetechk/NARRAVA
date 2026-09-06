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
  html += renderPosterGrid(list, activeTab === 'vip');

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

function shelfHtml(shelf){
  return '<div class="shelf">' +
    '<div class="shelf-head">' +
      '<div class="shelf-title-group">' +
        '<h3 class="shelf-title">' + shelf.title + '</h3>' +
        (shelf.caption ? '<span class="shelf-caption">' + shelf.caption + '</span>' : '') +
      '</div>' +
      '<button type="button" class="shelf-viewall" data-shelf-key="' + shelf.key + '">View all ›</button>' +
    '</div>' +
    '<div class="shelf-row">' + shelf.items.map(s => posterCardHtml(s, false)).join('') + '</div>' +
  '</div>';
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

// ================= Top bar search panel (desktop) =================
//
// The icon in the top bar (see app.js) opens this sliding panel instead
// of showing a second, always-visible search bar. It shares the exact
// same `searchQuery` state and `matchesSearch()` predicate as
// discoverSearchInput above — typing here also keeps the mobile/
// expanded-grid view in sync via the same renderDiscoverBody() call —
// this is one search implementation with two trigger elements, not two
// separate searches.
// topbarSearchInput and topbarSearchPanel are already declared in
// app.js (it wires the icon that opens/closes this panel) — reused
// here as-is, not redeclared.
const topbarSearchInputWrap = document.getElementById('topbarSearchInputWrap');
const topbarSearchClear = document.getElementById('topbarSearchClear');
const topbarSuggestRow = document.getElementById('topbarSuggestRow');
const topbarSuggestResults = document.getElementById('topbarSuggestResults');

function renderTopbarSearchResults(query){
  const q = query.trim();
  if(!q){
    topbarSuggestRow.classList.remove('hide');
    topbarSuggestResults.classList.remove('show');
    topbarSuggestResults.innerHTML = '';
    return;
  }
  const matches = slides.filter(matchesSearch);
  topbarSuggestRow.classList.add('hide');
  topbarSuggestResults.classList.add('show');
  topbarSuggestResults.innerHTML = matches.length
    ? matches.map(s =>
        '<button type="button" class="topbar-result-row" data-slide-index="' + slides.indexOf(s) + '">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
          s.title +
        '</button>'
      ).join('')
    : '<button type="button" class="topbar-result-row" disabled>No matches for "' + query + '"</button>';

  topbarSuggestResults.querySelectorAll('.topbar-result-row[data-slide-index]').forEach(row => {
    row.addEventListener('click', () => {
      openSeriesInFeed(parseInt(row.dataset.slideIndex, 10));
      topbarSearchPanel.classList.remove('open');
    });
  });
}

topbarSearchInput.addEventListener('input', () => {
  searchQuery = topbarSearchInput.value.trim().toLowerCase();
  topbarSearchInputWrap.classList.toggle('has-text', !!topbarSearchInput.value);
  renderTopbarSearchResults(topbarSearchInput.value);
  renderDiscoverBody();
});
topbarSearchClear.addEventListener('click', () => {
  topbarSearchInput.value = '';
  searchQuery = '';
  topbarSearchInputWrap.classList.remove('has-text');
  renderTopbarSearchResults('');
  renderDiscoverBody();
  topbarSearchInput.focus();
});
topbarSuggestRow.addEventListener('click', e => {
  if(!e.target.classList.contains('topbar-suggest-pill')) return;
  topbarSearchInput.value = e.target.textContent;
  searchQuery = e.target.textContent.trim().toLowerCase();
  topbarSearchInputWrap.classList.add('has-text');
  renderTopbarSearchResults(e.target.textContent);
  renderDiscoverBody();
});

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

  // Search suggestion pills: plain real titles, in whatever order the
  // series query returned — not a "Trending" claim, since there's no
  // real search-volume data behind it (same honesty rule the Popular/
  // Rankings tabs already follow for this exact gap).
  topbarSuggestRow.innerHTML = slides.slice(0, 5)
    .map(s => '<span class="topbar-suggest-pill">' + s.title + '</span>')
    .join('');
}

initDiscover();
