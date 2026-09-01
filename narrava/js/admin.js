// admin.js
//
// Admin panel, part 1: create a series, assign it genres, and toggle it
// featured — all real writes on the admin's own authenticated Supabase
// client. The admin-only RLS policies from Week 1 already gate every
// write here; this file adds no new access, it's a UI for what the
// Table Editor already allowed by hand. Episode/video upload is a
// separate, later task and this file does not touch it.
//
// Reachable only via the "Admin Panel" row profile.js draws when
// profiles.is_admin is true for the current session — that's a display
// decision, not a security boundary; the real boundary is the RLS
// policies on series / series_genres.

const adminPanel = document.getElementById('adminPanel');

const ADMIN_BACK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>';

let adminSeries = [];       // [{id, title, description, cover_image_url, free_episode_count, featured_at}]
let adminGenres = [];       // [{id, name}]
let adminSeriesGenres = {}; // series_id -> Set(genre_id)

function adminHeaderHtml(){
  return '<div class="admin-header">' +
    '<button type="button" class="admin-back" id="adminBackBtn" aria-label="Back to Profile">' + ADMIN_BACK_ICON + '</button>' +
    '<h2 class="admin-title">Admin Panel</h2>' +
  '</div>';
}

// Three real, current counts — derived from the same series/genres rows
// already held in memory for the list below, not a separate query, so
// they can never drift out of sync with what the list itself shows.
function statsHtml(){
  const totalSeries = adminSeries.length;
  const totalGenres = adminGenres.length;
  const featuredNow = adminSeries.filter(s => !!s.featured_at).length;

  return '<div class="admin-stats" id="adminStats">' +
    '<div class="admin-stat"><div class="admin-stat-value">' + totalSeries + '</div><div class="admin-stat-label">Total Series</div></div>' +
    '<div class="admin-stat"><div class="admin-stat-value">' + totalGenres + '</div><div class="admin-stat-label">Total Genres</div></div>' +
    '<div class="admin-stat"><div class="admin-stat-value">' + featuredNow + '</div><div class="admin-stat-label">Featured Now</div></div>' +
  '</div>';
}

// Re-renders just the stat row in place (used after a featured toggle,
// which updates a single series' state without redrawing the whole
// panel — the full create-series flow already re-renders everything).
function renderStats(){
  const statsEl = document.getElementById('adminStats');
  if(!statsEl) return;
  statsEl.outerHTML = statsHtml();
}

function createFormHtml(){
  return '<div class="admin-card">' +
    '<div class="auth-error" id="adminCreateError"></div>' +
    '<form id="adminCreateForm" novalidate>' +
      '<label class="auth-label" for="adminTitle">Title</label>' +
      '<input class="auth-input" type="text" id="adminTitle" required>' +
      '<label class="auth-label" for="adminDescription">Description</label>' +
      '<textarea class="auth-input" id="adminDescription" rows="3" required></textarea>' +
      '<label class="auth-label" for="adminCoverUrl">Cover Image URL</label>' +
      '<input class="auth-input" type="url" id="adminCoverUrl" placeholder="https://…">' +
      '<label class="auth-label" for="adminFreeEpisodes">Free Episode Count</label>' +
      '<input class="auth-input" type="number" id="adminFreeEpisodes" min="0" value="10" required>' +
      '<button class="auth-submit" type="submit" id="adminCreateSubmit">Create Series</button>' +
    '</form>' +
  '</div>';
}

// One row per series. Same markup on mobile and desktop — mobile stacks
// it into a card (.admin-series-row's default column layout), the
// >=900px admin-active rules in styles.css turn it into a compact
// table-style grid row instead. Nothing here needs to know which one
// is active.
function seriesRowHtml(series){
  const genreIds = adminSeriesGenres[series.id] || new Set();
  const chipsHtml = adminGenres.length
    ? '<div class="genre-chips">' + adminGenres.map(g =>
        '<button type="button" class="genre-chip' + (genreIds.has(g.id) ? ' active' : '') + '" data-series-id="' + series.id + '" data-genre-id="' + g.id + '">' + escapeHtml(g.name) + '</button>'
      ).join('') + '</div>'
    : '<div class="admin-series-meta">No genres exist yet.</div>';

  const isFeatured = !!series.featured_at;

  return '<div class="admin-series-row" data-series-id="' + series.id + '">' +
    '<div class="admin-series-main">' +
      '<div class="admin-series-title">' + escapeHtml(series.title) + '</div>' +
      '<div class="admin-series-desc">' + escapeHtml(series.description) + '</div>' +
      '<div class="admin-series-meta">Free episodes: ' + series.free_episode_count + '</div>' +
    '</div>' +
    '<div class="admin-series-genres">' + chipsHtml + '</div>' +
    '<div class="admin-series-featured">' +
      '<button type="button" class="admin-featured-btn' + (isFeatured ? ' active' : '') + '" data-action="toggle-featured" data-series-id="' + series.id + '">' +
        (isFeatured ? '★ Featured — tap to unfeature' : '☆ Not featured — tap to feature') +
      '</button>' +
    '</div>' +
  '</div>';
}

// Desktop-only column labels (styles.css hides this on mobile) —
// skipped entirely when the list is empty, same as an empty table.
function seriesListHeaderHtml(){
  return '<div class="admin-series-list-header">' +
    '<div>Series</div><div>Genres</div><div>Featured</div>' +
  '</div>';
}

function renderAdminList(){
  const listEl = document.getElementById('adminSeriesList');
  if(!listEl) return;

  listEl.innerHTML = adminSeries.length
    ? seriesListHeaderHtml() + '<div class="admin-list">' + adminSeries.map(seriesRowHtml).join('') + '</div>'
    : '<div class="admin-empty">No series yet — create the first one above.</div>';

  listEl.querySelectorAll('.genre-chip').forEach(chip => {
    chip.addEventListener('click', () => handleGenreChipClick(chip));
  });
  listEl.querySelectorAll('[data-action="toggle-featured"]').forEach(btn => {
    btn.addEventListener('click', () => handleFeaturedToggle(btn));
  });
}

function renderAdminPanel(){
  adminPanel.innerHTML =
    adminHeaderHtml() +
    statsHtml() +
    '<div class="admin-section-title">Create Series</div>' +
    createFormHtml() +
    '<div class="admin-section-title">Existing Series</div>' +
    '<div id="adminSeriesList"></div>';

  document.getElementById('adminBackBtn').addEventListener('click', () => showScreen('profile'));
  document.getElementById('adminCreateForm').addEventListener('submit', handleCreateSeriesSubmit);
  renderAdminList();
}

async function loadAdminData(){
  try {
    const [seriesResult, genreResult, linkResult] = await Promise.all([
      supabaseClient.from('series').select('id, title, description, cover_image_url, free_episode_count, featured_at').order('created_at', { ascending: false }),
      supabaseClient.from('genres').select('id, name'),
      supabaseClient.from('series_genres').select('series_id, genre_id')
    ]);

    if(seriesResult.error) throw seriesResult.error;
    if(genreResult.error) throw genreResult.error;
    if(linkResult.error) throw linkResult.error;

    adminSeries = seriesResult.data || [];
    adminGenres = genreResult.data || [];
    adminSeriesGenres = {};
    (linkResult.data || []).forEach(link => {
      if(!adminSeriesGenres[link.series_id]) adminSeriesGenres[link.series_id] = new Set();
      adminSeriesGenres[link.series_id].add(link.genre_id);
    });
  } catch(err){
    console.error('Narrava: failed to load admin data', err);
    adminSeries = [];
    adminGenres = [];
    adminSeriesGenres = {};
    showToast('Could not load admin data — please try again');
  }
}

async function handleCreateSeriesSubmit(e){
  e.preventDefault();

  const title = document.getElementById('adminTitle').value.trim();
  const description = document.getElementById('adminDescription').value.trim();
  const coverImageUrl = document.getElementById('adminCoverUrl').value.trim();
  const freeEpisodeCountRaw = document.getElementById('adminFreeEpisodes').value;
  const errorEl = document.getElementById('adminCreateError');
  const submitBtn = document.getElementById('adminCreateSubmit');

  errorEl.textContent = '';
  errorEl.classList.remove('show');

  if(!title || !description){
    errorEl.textContent = 'Title and description are required.';
    errorEl.classList.add('show');
    return;
  }

  const freeEpisodeCount = freeEpisodeCountRaw === '' ? 10 : parseInt(freeEpisodeCountRaw, 10);

  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating…';

  try {
    const { data, error } = await supabaseClient
      .from('series')
      .insert({
        title,
        description,
        cover_image_url: coverImageUrl || null,
        free_episode_count: freeEpisodeCount
      })
      .select('id, title, description, cover_image_url, free_episode_count, featured_at')
      .single();

    if(error) throw error;

    adminSeries.unshift(data);
    showToast('Series created ✓');
    renderAdminPanel();
  } catch(err){
    console.error('Narrava: failed to create series', err);
    errorEl.textContent = err.message || 'Could not create series — please try again.';
    errorEl.classList.add('show');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Series';
  }
}

async function handleGenreChipClick(chip){
  const seriesId = chip.dataset.seriesId;
  const genreId = chip.dataset.genreId;
  const isActive = chip.classList.contains('active');

  chip.disabled = true;

  try {
    if(isActive){
      const { error } = await supabaseClient
        .from('series_genres')
        .delete()
        .eq('series_id', seriesId)
        .eq('genre_id', genreId);
      if(error) throw error;

      adminSeriesGenres[seriesId].delete(genreId);
      chip.classList.remove('active');
    } else {
      const { error } = await supabaseClient
        .from('series_genres')
        .insert({ series_id: seriesId, genre_id: genreId });
      if(error) throw error;

      if(!adminSeriesGenres[seriesId]) adminSeriesGenres[seriesId] = new Set();
      adminSeriesGenres[seriesId].add(genreId);
      chip.classList.add('active');
    }
  } catch(err){
    console.error('Narrava: failed to update series genre', err);
    showToast('Could not update genre — please try again');
  } finally {
    chip.disabled = false;
  }
}

async function handleFeaturedToggle(btn){
  const seriesId = btn.dataset.seriesId;
  const series = adminSeries.find(s => String(s.id) === String(seriesId));
  if(!series) return;

  const willFeature = !series.featured_at;
  btn.disabled = true;

  try {
    const { data, error } = await supabaseClient
      .from('series')
      .update({ featured_at: willFeature ? new Date().toISOString() : null })
      .eq('id', seriesId)
      .select('featured_at')
      .single();
    if(error) throw error;

    series.featured_at = data.featured_at;
    btn.classList.toggle('active', !!series.featured_at);
    btn.textContent = series.featured_at ? '★ Featured — tap to unfeature' : '☆ Not featured — tap to feature';
    renderStats();
    showToast(series.featured_at ? 'Marked as featured ✓' : 'Removed from featured');
  } catch(err){
    console.error('Narrava: failed to toggle featured', err);
    showToast('Could not update featured status — please try again');
  } finally {
    btn.disabled = false;
  }
}

// Entry point, called from profile.js when the Admin Panel row is tapped.
async function renderAdminScreen(){
  adminPanel.innerHTML = '<div class="admin-empty">Loading…</div>';
  await loadAdminData();
  renderAdminPanel();
}
