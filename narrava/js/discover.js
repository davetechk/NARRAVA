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

function posterArtSrc(slide){
  return (slide.art && slide.art.type === 'img') ? slide.art.src : '';
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
  return '<div class="poster-grid">' + list.map(s => {
    const src = posterArtSrc(s);
    const img = src ? '<img src="' + src + '" alt="">' : '';
    const lock = locked
      ? '<div class="poster-lock"><svg viewBox="0 0 24 24" fill="#E8B85C"><path d="M6 10V8a6 6 0 0112 0v2h1a1 1 0 011 1v9a1 1 0 01-1 1H5a1 1 0 01-1-1v-9a1 1 0 011-1h1zm2 0h8V8a4 4 0 00-8 0v2z"/></svg></div>'
      : '';
    return '<div class="poster-card' + (locked ? ' locked' : '') + '" data-slide-index="' + slides.indexOf(s) + '">' +
      img + lock +
      '<div class="poster-title">' + s.title + '</div>' +
    '</div>';
  }).join('') + '</div>';
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

// Desktop-only featured banner above the tabs (hidden on mobile via
// CSS). Picks one series at random from the same `slides` app.js
// already loaded — no extra fetch, no invented "featured" flag, and
// this pick is made once so it doesn't jump around every time the
// tab/search/genre selection re-renders the grid below it.
function renderHero(){
  if(!discoverHero) return;
  if(slides.length === 0){
    discoverHero.innerHTML = '';
    return;
  }

  const s = slides[Math.floor(Math.random() * slides.length)];
  const src = posterArtSrc(s);
  const img = src ? '<img src="' + src + '" alt="">' : '';

  discoverHero.innerHTML =
    '<div class="hero-media">' + img + '<div class="hero-gradient"></div></div>' +
    '<div class="hero-content">' +
      '<h2 class="hero-title">' + s.title + '</h2>' +
      '<p class="hero-synopsis">' + s.synopsis + '</p>' +
      '<button class="hero-play" id="heroPlayBtn" type="button">▶ Watch Now</button>' +
    '</div>';

  document.getElementById('heroPlayBtn').addEventListener('click', () => {
    openSeriesInFeed(slides.indexOf(s));
  });
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

async function initDiscover(){
  const [genreRows, links] = await Promise.all([fetchGenres(), fetchSeriesGenres()]);
  genres = genreRows;
  links.forEach(link => {
    if(!seriesGenreMap[link.series_id]) seriesGenreMap[link.series_id] = new Set();
    seriesGenreMap[link.series_id].add(link.genre_id);
  });

  await slidesReady; // app.js: don't render the grid until slides exist
  renderHero();
  renderDiscoverBody();
}

initDiscover();
