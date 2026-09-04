// admin.js
//
// The admin dashboard — its own real page (admin.html), not a screen
// inside the consumer app. Owns three things: (1) a simple login-only
// gate (no sign up — admin accounts are provisioned by hand in the
// database) that checks profiles.is_admin the same way the rest of the
// app does, (2) the dashboard itself — real stats, create/edit/delete
// series, genre assignment, publish/feature toggles, and episode
// upload — all real writes on the admin's own authenticated Supabase
// client, and (3) honest "Coming soon" placeholders for the sections
// that aren't built yet (User Management, Revenue & Analytics, System
// Settings), so the sidebar never links to something broken.
//
// The admin-only RLS policies already gate every write here — this is
// a UI for what those policies already allowed, not a new access path.
// escapeHtml/showToast come from shared-utils.js, shared with the
// consumer app rather than duplicated.

// ---------- elements ----------
const adminLoginView = document.getElementById('adminLoginView');
const adminDeniedView = document.getElementById('adminDeniedView');
const adminAppView = document.getElementById('adminAppView');
const adminMainContent = document.getElementById('adminMainContent');

const ADMIN_EDIT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>';
const ADMIN_DELETE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6"/></svg>';
const ADMIN_SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';

// ---------- state ----------
let adminSession = null;

let adminSeries = [];       // [{id, title, description, cover_image_url, free_episode_count, featured_at, status}]
let adminGenres = [];       // [{id, name}]
let adminSeriesGenres = {}; // series_id -> Set(genre_id)
let adminTotalUsers = null;
let adminTotalRevenue = null;

let adminEpisodesCache = {}; // series_id -> [{id, episode_number, title, bunny_video_id, duration_seconds}], undefined until first loaded

let activeView = 'dashboard';       // 'dashboard' | 'content' | 'users' | 'revenue' | 'settings'
let seriesSearchQuery = '';         // client-side filter on adminSeries, no re-query
let editingSeriesId = null;         // series currently showing its inline edit form
let deletingSeriesId = null;        // series currently showing its inline delete confirmation
let selectedEpisodeSeriesId = null; // series currently selected in the persistent Episode Management panel

function formatNaira(amount){
  return '₦' + Number(amount).toLocaleString('en-NG');
}

// ================= Login gate =================

function showLoginView(){
  adminLoginView.classList.remove('screen-hidden');
  adminDeniedView.classList.add('screen-hidden');
  adminAppView.classList.add('screen-hidden');
}
function showDeniedView(){
  adminLoginView.classList.add('screen-hidden');
  adminDeniedView.classList.remove('screen-hidden');
  adminAppView.classList.add('screen-hidden');
}
function showAppView(){
  adminLoginView.classList.add('screen-hidden');
  adminDeniedView.classList.add('screen-hidden');
  adminAppView.classList.remove('screen-hidden');
  const emailEl = document.getElementById('adminSidebarEmail');
  if(emailEl && adminSession) emailEl.textContent = adminSession.user.email;
}

// Same pattern used elsewhere in the app (profile.js's checkIsAdmin): a
// normal select-own read on the signed-in user's own profiles row,
// governed by the existing RLS policy. This only decides whether this
// *page* shows its content — the real boundary is the admin-only RLS
// policies on series / series_genres / episodes themselves.
async function checkIsAdmin(userId){
  try {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .single();
    if(error) throw error;
    return !!(data && data.is_admin);
  } catch(err){
    console.error('Narrava: failed to check admin status', err);
    return false;
  }
}

async function afterAuthResolved(session){
  adminSession = session;
  const admin = await checkIsAdmin(session.user.id);
  if(admin){
    showAppView();
    await loadAdminData();
    renderMain();
  } else {
    showDeniedView();
  }
}

async function initAdminPage(){
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if(error) throw error;
    const session = data && data.session;
    if(!session){ showLoginView(); return; }
    await afterAuthResolved(session);
  } catch(err){
    console.error('Narrava: failed to check auth session', err);
    showLoginView();
  }
}

async function handleAdminLoginSubmit(e){
  e.preventDefault();

  const email = document.getElementById('adminLoginEmail').value.trim();
  const password = document.getElementById('adminLoginPassword').value;
  const errorEl = document.getElementById('adminLoginError');
  const submitBtn = document.getElementById('adminLoginSubmit');

  errorEl.textContent = '';
  errorEl.classList.remove('show');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Logging in…';

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if(error){
      errorEl.textContent = error.message;
      errorEl.classList.add('show');
      return;
    }
    submitBtn.textContent = 'Checking admin access…';
    await afterAuthResolved(data.session);
  } catch(err){
    console.error('Narrava: admin login failed', err);
    errorEl.textContent = 'Something went wrong. Please try again.';
    errorEl.classList.add('show');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Log In';
  }
}

async function handleAdminSignOut(){
  try {
    const { error } = await supabaseClient.auth.signOut();
    if(error) throw error;
  } catch(err){
    console.error('Narrava: sign out failed', err);
    showToast('Could not sign out — please try again');
    return;
  }

  adminSession = null;
  adminSeries = [];
  adminGenres = [];
  adminSeriesGenres = {};
  adminTotalUsers = null;
  adminTotalRevenue = null;
  adminEpisodesCache = {};
  activeView = 'dashboard';
  seriesSearchQuery = '';
  editingSeriesId = null;
  deletingSeriesId = null;
  selectedEpisodeSeriesId = null;

  document.getElementById('adminLoginEmail').value = '';
  document.getElementById('adminLoginPassword').value = '';
  showLoginView();
}

// ================= Data load =================

async function loadAdminData(){
  try {
    const [seriesResult, genreResult, linkResult, usersResult, revenueResult] = await Promise.all([
      supabaseClient.from('series').select('id, title, description, cover_image_url, free_episode_count, featured_at, status').order('created_at', { ascending: false }),
      supabaseClient.from('genres').select('id, name'),
      supabaseClient.from('series_genres').select('series_id, genre_id'),
      supabaseClient.rpc('admin_total_users'),
      supabaseClient.rpc('admin_total_revenue')
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

    // These two never abort the rest of the panel — a failed or null
    // RPC just falls back to '—' in the stats row (see statsHtml).
    if(usersResult.error){
      console.error('Narrava: admin_total_users failed', usersResult.error);
      adminTotalUsers = null;
    } else {
      adminTotalUsers = usersResult.data === undefined ? null : usersResult.data;
    }

    if(revenueResult.error){
      console.error('Narrava: admin_total_revenue failed', revenueResult.error);
      adminTotalRevenue = null;
    } else {
      adminTotalRevenue = revenueResult.data === undefined ? null : revenueResult.data;
    }
  } catch(err){
    console.error('Narrava: failed to load admin data', err);
    adminSeries = [];
    adminGenres = [];
    adminSeriesGenres = {};
    adminTotalUsers = null;
    adminTotalRevenue = null;
    showToast('Could not load admin data — please try again');
  }
}

// ================= Sidebar / view switching =================

function setActiveNav(){
  document.querySelectorAll('.admin-nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.view === activeView);
  });
}

function renderMain(){
  setActiveNav();
  if(activeView === 'dashboard'){
    adminMainContent.innerHTML = dashboardViewHtml();
  } else if(activeView === 'content'){
    adminMainContent.innerHTML = contentViewHtml();
    wireContentView();
  } else {
    adminMainContent.innerHTML = placeholderViewHtml(activeView);
  }
}

function pageHeaderHtml(title, showSearch){
  return '<div class="admin-page-header">' +
    '<h1 class="admin-page-title">' + title + '</h1>' +
    (showSearch
      ? '<div class="admin-search">' + ADMIN_SEARCH_ICON +
          '<input type="text" id="adminSeriesSearch" placeholder="Search series by title…" value="' + escapeHtml(seriesSearchQuery) + '">' +
        '</div>'
      : '') +
  '</div>';
}

function placeholderViewHtml(view){
  const titles = { users: 'User Management', revenue: 'Revenue & Analytics', settings: 'System Settings' };
  const title = titles[view] || 'Coming Soon';
  return pageHeaderHtml(title, false) +
    '<div class="admin-placeholder"><strong>Coming soon</strong>' + title + ' isn’t built yet. This is an honest placeholder, not missing functionality — nothing here is broken.</div>';
}

// ================= Dashboard view =================

// Five real, current numbers — Total Series/Genres/Featured come from
// the same rows already held in memory for the content view's list, so
// they can never drift out of sync with what that list shows. The two
// RPC-backed numbers show '—' instead of breaking the layout if either
// RPC failed or came back null (loadAdminData leaves them at null in
// that case, never a raw error object or the string "null").
function statsHtml(){
  const totalSeries = adminSeries.length;
  const totalGenres = adminGenres.length;
  const featuredNow = adminSeries.filter(s => !!s.featured_at).length;

  const totalUsersDisplay = (adminTotalUsers === null || adminTotalUsers === undefined)
    ? '—' : adminTotalUsers;
  const totalRevenueDisplay = (adminTotalRevenue === null || adminTotalRevenue === undefined)
    ? '—' : formatNaira(adminTotalRevenue);

  return '<div class="admin-stats">' +
    '<div class="admin-stat"><div class="admin-stat-value">' + totalSeries + '</div><div class="admin-stat-label">Total Series</div></div>' +
    '<div class="admin-stat"><div class="admin-stat-value">' + totalGenres + '</div><div class="admin-stat-label">Total Genres</div></div>' +
    '<div class="admin-stat"><div class="admin-stat-value">' + featuredNow + '</div><div class="admin-stat-label">Featured Now</div></div>' +
    '<div class="admin-stat"><div class="admin-stat-value">' + totalUsersDisplay + '</div><div class="admin-stat-label">Registered Users</div></div>' +
    '<div class="admin-stat"><div class="admin-stat-value">' + totalRevenueDisplay + '</div><div class="admin-stat-label">Total Revenue</div></div>' +
  '</div>' +
  '<div class="discover-note">Subscriptions launch in Phase 2 — no subscription data exists yet.</div>';
}

function dashboardViewHtml(){
  return pageHeaderHtml('Dashboard', false) + statsHtml();
}

// ================= Content Management view =================

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

function filteredSeries(){
  const q = seriesSearchQuery.trim().toLowerCase();
  if(!q) return adminSeries;
  return adminSeries.filter(s => s.title.toLowerCase().includes(q));
}

function seriesListHeaderHtml(){
  return '<div class="admin-series-list-header">' +
    '<div>Series</div><div>Genres</div><div>Published</div><div>Featured</div><div>Actions</div>' +
  '</div>';
}

function seriesListHtml(){
  if(!adminSeries.length){
    return '<div class="admin-empty">No series yet — create the first one above.</div>';
  }
  const list = filteredSeries();
  if(!list.length){
    return '<div class="admin-empty">No series match “' + escapeHtml(seriesSearchQuery) + '”.</div>';
  }
  return seriesListHeaderHtml() + '<div class="admin-list">' + list.map(seriesRowHtml).join('') + '</div>';
}

function seriesRowHtml(series){
  if(editingSeriesId === series.id) return editSeriesRowHtml(series);
  if(deletingSeriesId === series.id) return deleteConfirmRowHtml(series);

  const genreIds = adminSeriesGenres[series.id] || new Set();
  const chipsHtml = adminGenres.length
    ? '<div class="genre-chips">' + adminGenres.map(g =>
        '<button type="button" class="genre-chip' + (genreIds.has(g.id) ? ' active' : '') + '" data-series-id="' + series.id + '" data-genre-id="' + g.id + '">' + escapeHtml(g.name) + '</button>'
      ).join('') + '</div>'
    : '<div class="admin-series-meta">No genres exist yet.</div>';

  const isPublished = series.status === 'published';
  const isFeatured = !!series.featured_at;

  return '<div class="admin-series-row" data-series-id="' + series.id + '">' +
    '<div class="admin-series-main">' +
      '<div class="admin-series-title">' + escapeHtml(series.title) + '</div>' +
      '<div class="admin-series-meta">Free episodes: ' + series.free_episode_count + '</div>' +
    '</div>' +
    '<div class="admin-series-genres">' + chipsHtml + '</div>' +
    '<button type="button" class="admin-toggle-btn published' + (isPublished ? ' active' : '') + '" data-action="toggle-published" data-series-id="' + series.id + '">' +
      (isPublished ? '● Published' : '○ Draft') +
    '</button>' +
    '<button type="button" class="admin-toggle-btn featured' + (isFeatured ? ' active' : '') + '" data-action="toggle-featured" data-series-id="' + series.id + '">' +
      (isFeatured ? '★ Featured' : '☆ Not featured') +
    '</button>' +
    '<div class="admin-row-actions">' +
      '<button type="button" class="admin-icon-btn" data-action="edit-series" data-series-id="' + series.id + '" aria-label="Edit series">' + ADMIN_EDIT_ICON + '</button>' +
      '<button type="button" class="admin-icon-btn delete" data-action="delete-series" data-series-id="' + series.id + '" aria-label="Delete series">' + ADMIN_DELETE_ICON + '</button>' +
    '</div>' +
  '</div>';
}

function editSeriesRowHtml(series){
  return '<div class="admin-series-row" data-series-id="' + series.id + '">' +
    '<form class="admin-edit-form" id="editSeriesForm-' + series.id + '" data-series-id="' + series.id + '" novalidate>' +
      '<div class="auth-error" id="editSeriesError-' + series.id + '"></div>' +
      '<div class="admin-edit-form-row">' +
        '<div>' +
          '<label class="auth-label" for="editTitle-' + series.id + '">Title</label>' +
          '<input class="auth-input" type="text" id="editTitle-' + series.id + '" value="' + escapeHtml(series.title) + '" required>' +
        '</div>' +
        '<div>' +
          '<label class="auth-label" for="editFreeEpisodes-' + series.id + '">Free Episode Count</label>' +
          '<input class="auth-input" type="number" min="0" id="editFreeEpisodes-' + series.id + '" value="' + series.free_episode_count + '" required>' +
        '</div>' +
      '</div>' +
      '<label class="auth-label" for="editDescription-' + series.id + '">Description</label>' +
      '<textarea class="auth-input" rows="3" id="editDescription-' + series.id + '" required>' + escapeHtml(series.description) + '</textarea>' +
      '<label class="auth-label" for="editCoverUrl-' + series.id + '">Cover Image URL</label>' +
      '<input class="auth-input" type="url" id="editCoverUrl-' + series.id + '" value="' + escapeHtml(series.cover_image_url || '') + '" placeholder="https://…">' +
      '<div class="admin-edit-actions">' +
        '<button class="auth-submit" type="submit" id="editSeriesSubmit-' + series.id + '">Save Changes</button>' +
        '<button type="button" class="admin-edit-cancel" data-action="cancel-edit" data-series-id="' + series.id + '">Cancel</button>' +
      '</div>' +
    '</form>' +
  '</div>';
}

function deleteConfirmRowHtml(series){
  const cached = adminEpisodesCache[series.id];
  const episodeNote = cached !== undefined
    ? (cached.length + ' episode' + (cached.length === 1 ? '' : 's'))
    : 'its episodes';

  return '<div class="admin-series-row" data-series-id="' + series.id + '">' +
    '<div class="admin-delete-confirm">' +
      '<p>Delete “' + escapeHtml(series.title) + '” permanently? This also deletes ' + episodeNote + ' and its genre links — the database cascades that automatically. This can’t be undone.</p>' +
      '<div class="admin-delete-confirm-actions">' +
        '<button type="button" class="admin-delete-confirm-btn" data-action="confirm-delete" data-series-id="' + series.id + '">Delete Permanently</button>' +
        '<button type="button" class="admin-delete-cancel-btn" data-action="cancel-delete" data-series-id="' + series.id + '">Cancel</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function contentViewHtml(){
  return pageHeaderHtml('Content Management', true) +
    '<div class="admin-section-title">Create Series</div>' +
    createFormHtml() +
    '<div class="admin-section-title">Existing Series</div>' +
    '<div id="adminSeriesList">' + seriesListHtml() + '</div>' +
    '<div class="admin-section-title">Episode Management</div>' +
    '<div class="admin-card" id="episodeManagementCard">' + episodeManagementHtml() + '</div>';
}

function wireContentView(){
  document.getElementById('adminCreateForm').addEventListener('submit', handleCreateSeriesSubmit);
  wireSeriesListActions();

  const searchInput = document.getElementById('adminSeriesSearch');
  if(searchInput){
    searchInput.addEventListener('input', () => {
      seriesSearchQuery = searchInput.value;
      renderSeriesList();
    });
  }

  wireEpisodeManagement();
}

function renderSeriesList(){
  const el = document.getElementById('adminSeriesList');
  if(!el) return;
  el.innerHTML = seriesListHtml();
  wireSeriesListActions();
}

function wireSeriesListActions(){
  const el = document.getElementById('adminSeriesList');
  if(!el) return;

  el.querySelectorAll('.genre-chip').forEach(chip => {
    chip.addEventListener('click', () => handleGenreChipClick(chip));
  });
  el.querySelectorAll('[data-action="toggle-published"]').forEach(btn => {
    btn.addEventListener('click', () => handlePublishedToggle(btn));
  });
  el.querySelectorAll('[data-action="toggle-featured"]').forEach(btn => {
    btn.addEventListener('click', () => handleFeaturedToggle(btn));
  });
  el.querySelectorAll('[data-action="edit-series"]').forEach(btn => {
    btn.addEventListener('click', () => {
      editingSeriesId = btn.dataset.seriesId;
      deletingSeriesId = null;
      renderSeriesList();
    });
  });
  el.querySelectorAll('[data-action="cancel-edit"]').forEach(btn => {
    btn.addEventListener('click', () => {
      editingSeriesId = null;
      renderSeriesList();
    });
  });
  el.querySelectorAll('[data-action="delete-series"]').forEach(btn => {
    btn.addEventListener('click', () => {
      deletingSeriesId = btn.dataset.seriesId;
      editingSeriesId = null;
      renderSeriesList();
    });
  });
  el.querySelectorAll('[data-action="cancel-delete"]').forEach(btn => {
    btn.addEventListener('click', () => {
      deletingSeriesId = null;
      renderSeriesList();
    });
  });
  el.querySelectorAll('[data-action="confirm-delete"]').forEach(btn => {
    btn.addEventListener('click', () => handleDeleteSeries(btn));
  });
  el.querySelectorAll('.admin-edit-form').forEach(form => {
    form.addEventListener('submit', handleEditSeriesSubmit);
  });
}

async function handleCreateSeriesSubmit(e){
  e.preventDefault();

  // Captured now, not read off `e` after the await below — the browser
  // clears e.currentTarget once event dispatch finishes, so reading it
  // post-await throws "Cannot read properties of null (reading 'reset')".
  const form = e.currentTarget;

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
    // No status field sent — new series default to 'draft' at the
    // database level. Publishing is a separate, deliberate action from
    // the list below (handlePublishedToggle), not part of creation.
    const { data, error } = await supabaseClient
      .from('series')
      .insert({
        title,
        description,
        cover_image_url: coverImageUrl || null,
        free_episode_count: freeEpisodeCount
      })
      .select('id, title, description, cover_image_url, free_episode_count, featured_at, status')
      .single();

    if(error) throw error;

    adminSeries.unshift(data);
    showToast('Series created ✓ — it starts as a draft, publish it below when ready');
    form.reset();
    document.getElementById('adminFreeEpisodes').value = 10;
    renderSeriesList();
    populateEpisodeSeriesSelect();
  } catch(err){
    console.error('Narrava: failed to create series', err);
    errorEl.textContent = err.message || 'Could not create series — please try again.';
    errorEl.classList.add('show');
  } finally {
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

async function handlePublishedToggle(btn){
  const seriesId = btn.dataset.seriesId;
  const series = adminSeries.find(s => String(s.id) === String(seriesId));
  if(!series) return;

  const willPublish = series.status !== 'published';
  btn.disabled = true;

  try {
    const { data, error } = await supabaseClient
      .from('series')
      .update({ status: willPublish ? 'published' : 'draft' })
      .eq('id', seriesId)
      .select('status')
      .single();
    if(error) throw error;

    series.status = data.status;
    btn.classList.toggle('active', series.status === 'published');
    btn.textContent = series.status === 'published' ? '● Published' : '○ Draft';
    showToast(series.status === 'published' ? 'Series published ✓ — now visible in Discover' : 'Moved back to draft — hidden from Discover');
  } catch(err){
    console.error('Narrava: failed to toggle published status', err);
    showToast('Could not update published status — please try again');
  } finally {
    btn.disabled = false;
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
    btn.textContent = series.featured_at ? '★ Featured' : '☆ Not featured';
    showToast(series.featured_at ? 'Marked as featured ✓' : 'Removed from featured');
  } catch(err){
    console.error('Narrava: failed to toggle featured', err);
    showToast('Could not update featured status — please try again');
  } finally {
    btn.disabled = false;
  }
}

async function handleEditSeriesSubmit(e){
  e.preventDefault();

  const form = e.currentTarget;
  const seriesId = form.dataset.seriesId;
  const errorEl = document.getElementById('editSeriesError-' + seriesId);
  const submitBtn = document.getElementById('editSeriesSubmit-' + seriesId);

  const title = document.getElementById('editTitle-' + seriesId).value.trim();
  const description = document.getElementById('editDescription-' + seriesId).value.trim();
  const coverImageUrl = document.getElementById('editCoverUrl-' + seriesId).value.trim();
  const freeEpisodeCountRaw = document.getElementById('editFreeEpisodes-' + seriesId).value;

  errorEl.textContent = '';
  errorEl.classList.remove('show');

  if(!title || !description){
    errorEl.textContent = 'Title and description are required.';
    errorEl.classList.add('show');
    return;
  }

  const freeEpisodeCount = freeEpisodeCountRaw === '' ? 0 : parseInt(freeEpisodeCountRaw, 10);

  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving…';

  try {
    const { data, error } = await supabaseClient
      .from('series')
      .update({
        title,
        description,
        cover_image_url: coverImageUrl || null,
        free_episode_count: freeEpisodeCount
      })
      .eq('id', seriesId)
      .select('id, title, description, cover_image_url, free_episode_count, featured_at, status')
      .single();

    if(error) throw error;

    const idx = adminSeries.findIndex(s => String(s.id) === String(seriesId));
    if(idx !== -1) adminSeries[idx] = data;

    editingSeriesId = null;
    showToast('Series updated ✓');
    renderSeriesList();
    populateEpisodeSeriesSelect();
  } catch(err){
    console.error('Narrava: failed to update series', err);
    errorEl.textContent = err.message || 'Could not save changes — please try again.';
    errorEl.classList.add('show');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Changes';
  }
}

// The database already cascades series -> episodes / series_genres
// (set up in Week 1), so a single delete on the series row is enough —
// no manual cleanup of related rows needed here.
async function handleDeleteSeries(btn){
  const seriesId = btn.dataset.seriesId;
  btn.disabled = true;
  btn.textContent = 'Deleting…';

  try {
    const { error } = await supabaseClient.from('series').delete().eq('id', seriesId);
    if(error) throw error;

    adminSeries = adminSeries.filter(s => String(s.id) !== String(seriesId));
    delete adminSeriesGenres[seriesId];
    delete adminEpisodesCache[seriesId];
    if(String(selectedEpisodeSeriesId) === String(seriesId)) selectedEpisodeSeriesId = null;
    deletingSeriesId = null;

    showToast('Series deleted ✓');
    renderSeriesList();
    populateEpisodeSeriesSelect();
  } catch(err){
    console.error('Narrava: failed to delete series', err);
    showToast('Could not delete series — please try again');
    btn.disabled = false;
    btn.textContent = 'Delete Permanently';
  }
}

// ================= Episode management (persistent panel) =================

function episodeManagementHtml(){
  if(!adminSeries.length){
    return '<div class="admin-series-meta">Create a series above first.</div>';
  }

  const options = adminSeries.map(s =>
    '<option value="' + s.id + '"' + (String(s.id) === String(selectedEpisodeSeriesId) ? ' selected' : '') + '>' + escapeHtml(s.title) + '</option>'
  ).join('');

  return '<div class="admin-episode-panel-select">' +
      '<label class="auth-label" for="episodeSeriesSelect">Series</label>' +
      '<select class="auth-input" id="episodeSeriesSelect">' +
        '<option value="">Choose a series…</option>' + options +
      '</select>' +
    '</div>' +
    '<div id="episodeManagementBody">' + episodeManagementBodyHtml() + '</div>';
}

function episodeManagementBodyHtml(){
  if(!selectedEpisodeSeriesId) return '<div class="admin-empty">Choose a series above to view and add episodes.</div>';

  const episodes = adminEpisodesCache[selectedEpisodeSeriesId];
  if(episodes === undefined) return '<div class="admin-empty">Loading episodes…</div>';

  const listHtml = episodes.length
    ? '<div class="admin-episode-list">' + episodes.map(episodeRowHtml).join('') + '</div>'
    : '<div class="admin-series-meta">No episodes yet.</div>';

  const nextEpisodeNumber = episodes.length
    ? Math.max.apply(null, episodes.map(ep => ep.episode_number)) + 1
    : 1;

  return listHtml +
    // Always visible whenever a series is selected here, not just right
    // after an upload — Bunny's processing time is true any time an
    // admin is looking here, not just in the moment right after a save.
    '<div class="discover-note">A newly uploaded video may take a few minutes to finish processing on Bunny before it’s watchable.</div>' +
    addEpisodeFormHtml(selectedEpisodeSeriesId, nextEpisodeNumber);
}

function episodeRowHtml(ep){
  const hasVideo = !!ep.bunny_video_id;
  return '<div class="admin-episode-row">' +
    '<span class="admin-episode-number">Ep ' + ep.episode_number + '</span>' +
    '<span class="admin-episode-title">' + (ep.title ? escapeHtml(ep.title) : 'Untitled') + '</span>' +
    '<span class="admin-episode-video' + (hasVideo ? ' has-video' : '') + '">' + (hasVideo ? '✓ Video attached' : '— No video') + '</span>' +
  '</div>';
}

function addEpisodeFormHtml(seriesId, nextEpisodeNumber){
  return '<form class="admin-episode-form" id="addEpisodeForm-' + seriesId + '" data-series-id="' + seriesId + '" novalidate>' +
    '<div class="auth-error" id="episodeError-' + seriesId + '"></div>' +
    '<div class="admin-episode-form-row">' +
      '<div>' +
        '<label class="auth-label" for="episodeNumber-' + seriesId + '">Episode #</label>' +
        '<input class="auth-input" type="number" min="1" id="episodeNumber-' + seriesId + '" value="' + nextEpisodeNumber + '" required>' +
      '</div>' +
      '<div>' +
        '<label class="auth-label" for="episodeTitle-' + seriesId + '">Title (optional)</label>' +
        '<input class="auth-input" type="text" id="episodeTitle-' + seriesId + '">' +
      '</div>' +
    '</div>' +
    '<label class="auth-label" for="episodeFile-' + seriesId + '">Video File</label>' +
    '<input class="auth-input" type="file" accept="video/*" id="episodeFile-' + seriesId + '" required>' +
    '<div class="admin-upload-progress" id="episodeProgress-' + seriesId + '">' +
      '<div class="admin-upload-progress-bar"><div class="admin-upload-progress-fill" id="episodeProgressFill-' + seriesId + '"></div></div>' +
      '<div class="admin-upload-progress-label" id="episodeProgressLabel-' + seriesId + '">0%</div>' +
    '</div>' +
    '<button class="auth-submit" type="submit" id="episodeSubmit-' + seriesId + '">Upload Episode</button>' +
  '</form>';
}

function wireEpisodeManagement(){
  const select = document.getElementById('episodeSeriesSelect');
  if(select){
    select.addEventListener('change', async () => {
      selectedEpisodeSeriesId = select.value || null;
      renderEpisodeManagementBody();
      if(selectedEpisodeSeriesId && adminEpisodesCache[selectedEpisodeSeriesId] === undefined){
        await loadEpisodesForSeries(selectedEpisodeSeriesId);
        renderEpisodeManagementBody();
      }
    });
  }
  wireEpisodeManagementBody();
}

function renderEpisodeManagementBody(){
  const el = document.getElementById('episodeManagementBody');
  if(!el) return;
  el.innerHTML = episodeManagementBodyHtml();
  wireEpisodeManagementBody();
}

function wireEpisodeManagementBody(){
  if(!selectedEpisodeSeriesId) return;
  const formEl = document.getElementById('addEpisodeForm-' + selectedEpisodeSeriesId);
  if(formEl) formEl.addEventListener('submit', handleAddEpisodeSubmit);
}

// Called after create/edit/delete series so the dropdown's options stay
// in sync without re-rendering the whole Content view (which would
// also wipe out the search box's current text and cursor).
function populateEpisodeSeriesSelect(){
  const card = document.getElementById('episodeManagementCard');
  if(!card) return;

  // If the series currently selected here was just deleted, drop the
  // selection and re-render the body below too — otherwise the Add
  // Episode form stays on screen pointing at a series id that no
  // longer exists. Editing/creating a *different* series must not
  // trigger this — that would blow away an in-progress upload form for
  // whichever series the admin actually has open here.
  const stillSelectable = selectedEpisodeSeriesId && adminSeries.some(s => String(s.id) === String(selectedEpisodeSeriesId));
  if(selectedEpisodeSeriesId && !stillSelectable) selectedEpisodeSeriesId = null;

  if(!adminSeries.length){
    card.innerHTML = episodeManagementHtml();
    return;
  }

  const select = document.getElementById('episodeSeriesSelect');
  if(!select){
    card.innerHTML = episodeManagementHtml();
    wireEpisodeManagement();
    return;
  }

  select.innerHTML = '<option value="">Choose a series…</option>' +
    adminSeries.map(s => '<option value="' + s.id + '"' + (String(s.id) === String(selectedEpisodeSeriesId) ? ' selected' : '') + '>' + escapeHtml(s.title) + '</option>').join('');

  if(!stillSelectable) renderEpisodeManagementBody();
}

async function loadEpisodesForSeries(seriesId){
  try {
    const { data, error } = await supabaseClient
      .from('episodes')
      .select('id, episode_number, title, bunny_video_id, duration_seconds')
      .eq('series_id', seriesId)
      .order('episode_number', { ascending: true });
    if(error) throw error;
    adminEpisodesCache[seriesId] = data || [];
  } catch(err){
    console.error('Narrava: failed to load episodes', err);
    adminEpisodesCache[seriesId] = [];
    showToast('Could not load episodes — please try again');
  }
}

// The full upload flow, in the exact order it has to happen (unchanged
// from admin panel part 2 — only its position in the layout moved):
//   1. ask bunny-upload-init for permission (stop here on any failure —
//      never touch Bunny without it)
//   2. stream the actual file to Bunny over tus, showing real progress
//   3. only once the upload has genuinely succeeded, save the episode
//      row (bunny_video_id from step 1, duration_seconds left null —
//      there's no reliable way to know it yet)
// A failure at step 3 is the one edge case worth calling out: the video
// is already sitting on Bunny by then, so the error says so explicitly
// (with the video ID) instead of implying the upload itself failed.
async function handleAddEpisodeSubmit(e){
  e.preventDefault();

  const form = e.currentTarget;
  const seriesId = form.dataset.seriesId;
  const series = adminSeries.find(s => String(s.id) === String(seriesId));

  const numberInput = document.getElementById('episodeNumber-' + seriesId);
  const titleInput = document.getElementById('episodeTitle-' + seriesId);
  const fileInput = document.getElementById('episodeFile-' + seriesId);
  const errorEl = document.getElementById('episodeError-' + seriesId);
  const submitBtn = document.getElementById('episodeSubmit-' + seriesId);
  const progressWrap = document.getElementById('episodeProgress-' + seriesId);
  const progressFill = document.getElementById('episodeProgressFill-' + seriesId);
  const progressLabel = document.getElementById('episodeProgressLabel-' + seriesId);

  errorEl.textContent = '';
  errorEl.classList.remove('show');

  const episodeNumber = parseInt(numberInput.value, 10);
  const title = titleInput.value.trim();
  const file = fileInput.files[0];

  if(!episodeNumber || episodeNumber < 1){
    errorEl.textContent = 'Enter a valid episode number.';
    errorEl.classList.add('show');
    return;
  }
  if(!file){
    errorEl.textContent = 'Choose a video file to upload.';
    errorEl.classList.add('show');
    return;
  }

  // Bunny's own video title (metadata on the asset itself) — distinct
  // from the episode's own `title` column, which stays exactly what the
  // admin typed, including blank. Falls back to something legible when
  // the admin left the episode title blank, so the asset isn't just an
  // unlabeled ID in the Bunny dashboard.
  const bunnyTitle = title || (series ? series.title + ' — Episode ' + episodeNumber : 'Episode ' + episodeNumber);

  submitBtn.disabled = true;
  submitBtn.textContent = 'Requesting upload…';

  // --- Step 1: ask bunny-upload-init for permission ---
  let initResult;
  try {
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if(sessionError) throw sessionError;
    if(!sessionData || !sessionData.session || !sessionData.session.access_token){
      throw new Error('No active session — please log in again.');
    }

    const initResponse = await fetch(SUPABASE_URL + '/functions/v1/bunny-upload-init', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + sessionData.session.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title: bunnyTitle })
    });

    if(!initResponse.ok){
      let message = 'Upload permission request failed (status ' + initResponse.status + ').';
      try {
        const errBody = await initResponse.json();
        if(errBody && (errBody.error || errBody.message)) message = errBody.error || errBody.message;
      } catch(_parseErr){ /* body wasn't JSON — keep the status-based message */ }
      throw new Error(message);
    }

    initResult = await initResponse.json();
    if(!initResult || !initResult.videoId || !initResult.signature){
      throw new Error('Upload permission response was missing required fields.');
    }
  } catch(err){
    console.error('Narrava: bunny-upload-init failed', err);
    errorEl.textContent = 'Could not start the upload: ' + (err.message || 'please try again.');
    errorEl.classList.add('show');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Upload Episode';
    return; // never proceeds to step 2 without permission
  }

  // --- Step 2: the actual file, straight to Bunny over tus ---
  submitBtn.textContent = 'Uploading…';
  progressWrap.classList.add('show');
  progressFill.style.width = '0%';
  progressLabel.textContent = '0%';

  try {
    await new Promise((resolve, reject) => {
      const upload = new tus.Upload(file, {
        endpoint: 'https://video.bunnycdn.com/tusupload',
        // In-attempt retries for transient network blips only — this is
        // not the same as resuming across a page reload (not required
        // for this pass), it just makes one upload attempt itself more
        // resilient. tus-js-client's own documented default pattern.
        retryDelays: [0, 1000, 3000, 5000],
        headers: {
          AuthorizationSignature: initResult.signature,
          AuthorizationExpire: String(initResult.expirationTime),
          VideoId: initResult.videoId,
          LibraryId: String(initResult.libraryId)
        },
        metadata: {
          filetype: file.type,
          title: bunnyTitle
        },
        onError: (uploadError) => reject(uploadError),
        onProgress: (bytesUploaded, bytesTotal) => {
          const pct = bytesTotal ? Math.round((bytesUploaded / bytesTotal) * 100) : 0;
          progressFill.style.width = pct + '%';
          progressLabel.textContent = pct + '%';
        },
        onSuccess: () => resolve()
      });
      upload.start();
    });
  } catch(err){
    console.error('Narrava: Bunny upload failed', err);
    errorEl.textContent = 'The upload failed partway through: ' + (err && err.message ? err.message : 'please try again.');
    errorEl.classList.add('show');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Upload Episode';
    progressWrap.classList.remove('show');
    return; // no episode row is ever written for a failed upload
  }

  // --- Step 3: the upload genuinely succeeded — save the episode row ---
  submitBtn.textContent = 'Saving…';

  try {
    const { data: epData, error: epError } = await supabaseClient
      .from('episodes')
      .insert({
        series_id: seriesId,
        episode_number: episodeNumber,
        title: title || null,
        bunny_video_id: initResult.videoId,
        duration_seconds: null
      })
      .select('id, episode_number, title, bunny_video_id, duration_seconds')
      .single();

    if(epError) throw epError;

    if(!adminEpisodesCache[seriesId]) adminEpisodesCache[seriesId] = [];
    adminEpisodesCache[seriesId].push(epData);
    adminEpisodesCache[seriesId].sort((a, b) => a.episode_number - b.episode_number);

    showToast('Episode uploaded ✓ — Bunny may take a few minutes to finish processing');
    renderEpisodeManagementBody();
  } catch(err){
    console.error('Narrava: failed to save episode row after a successful Bunny upload', err);
    errorEl.textContent = 'The video uploaded to Bunny successfully (video ID: ' + initResult.videoId + '), but saving the episode record failed: ' +
      (err.message || 'please try again') + '. The video isn’t lost — retry saving, or add it manually using that video ID.';
    errorEl.classList.add('show');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Upload Episode';
    progressWrap.classList.remove('show');
  }
}

// ================= Wiring =================

document.getElementById('adminLoginForm').addEventListener('submit', handleAdminLoginSubmit);
document.getElementById('adminDeniedSignOut').addEventListener('click', handleAdminSignOut);
document.getElementById('adminSignOutBtn').addEventListener('click', handleAdminSignOut);

document.querySelectorAll('.admin-nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    activeView = btn.dataset.view;
    renderMain();
  });
});

initAdminPage();
