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
let adminTotalUsers = null;   // admin_total_users() RPC result, or null if it failed / isn't available
let adminTotalRevenue = null; // admin_total_revenue() RPC result, or null if it failed / isn't available

let adminEpisodes = {};              // series_id -> [{id, episode_number, title, bunny_video_id, duration_seconds}], undefined until first expand
let adminExpandedSeries = new Set(); // series_ids currently expanded in the list

function formatNaira(amount){
  return '₦' + Number(amount).toLocaleString('en-NG');
}

function adminHeaderHtml(){
  return '<div class="admin-header">' +
    '<button type="button" class="admin-back" id="adminBackBtn" aria-label="Back to Profile">' + ADMIN_BACK_ICON + '</button>' +
    '<h2 class="admin-title">Admin Panel</h2>' +
  '</div>';
}

// Five real, current numbers. The first three are derived from the same
// series/genres rows already held in memory for the list below — no
// separate query, so they can never drift out of sync with what the
// list itself shows. Registered Users and Total Revenue come from the
// admin_total_users()/admin_total_revenue() RPCs read in loadAdminData;
// either one shows as '—' instead of the panel breaking if that RPC
// failed or came back null (loadAdminData leaves them at null in that
// case, never at a raw error object or the string "null").
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
  // Same muted, centered note style as the Discover screen's "Rankings
  // coming soon" note — an honest placeholder, not a sixth stat card,
  // so it never reads as a broken or missing number.
  '<div class="discover-note">Subscriptions launch in Phase 2 — no subscription data exists yet.</div>';
}

// Re-renders just the stat row + note in place (used after a featured
// toggle, which updates a single series' state without redrawing the
// whole panel — the full create-series flow already re-renders
// everything). Targets the wrapper div, not .admin-stats itself, since
// statsHtml() now returns two sibling elements.
function renderStats(){
  const statsEl = document.getElementById('adminStats');
  if(!statsEl) return;
  statsEl.innerHTML = statsHtml();
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
  const isExpanded = adminExpandedSeries.has(series.id);

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
      '<button type="button" class="admin-episodes-toggle" data-action="toggle-episodes" data-series-id="' + series.id + '">' +
        (isExpanded ? '▾ Episodes' : '▸ Episodes') +
      '</button>' +
    '</div>' +
    '<div class="admin-series-episodes" id="episodesPanel-' + series.id + '"' + (isExpanded ? '' : ' hidden') + '>' +
      (isExpanded ? episodesPanelHtml(series.id) : '') +
    '</div>' +
  '</div>';
}

// Episodes for one series — a plain list (number / title / whether a
// video is attached) plus the Add Episode form. Only rendered once
// that series row is expanded (see handleEpisodesToggle); the fetch
// itself is lazy and cached in adminEpisodes so re-collapsing and
// re-expanding the same row doesn't re-fetch.
function episodesPanelHtml(seriesId){
  const episodes = adminEpisodes[seriesId] || [];
  const listHtml = episodes.length
    ? '<div class="admin-episode-list">' + episodes.map(episodeRowHtml).join('') + '</div>'
    : '<div class="admin-series-meta">No episodes yet.</div>';

  const nextEpisodeNumber = episodes.length
    ? Math.max.apply(null, episodes.map(ep => ep.episode_number)) + 1
    : 1;

  return listHtml +
    // Always visible whenever this panel is open, not just right after
    // an upload — Bunny's processing time is true any time an admin is
    // looking here, not just in the moment right after a save.
    '<div class="discover-note">A newly uploaded video may take a few minutes to finish processing on Bunny before it’s watchable.</div>' +
    addEpisodeFormHtml(seriesId, nextEpisodeNumber);
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
    '<div class="admin-upload-progress" id="episodeProgress-' + seriesId + '" hidden>' +
      '<div class="admin-upload-progress-bar"><div class="admin-upload-progress-fill" id="episodeProgressFill-' + seriesId + '"></div></div>' +
      '<div class="admin-upload-progress-label" id="episodeProgressLabel-' + seriesId + '">0%</div>' +
    '</div>' +
    '<button class="auth-submit" type="submit" id="episodeSubmit-' + seriesId + '">Upload Episode</button>' +
  '</form>';
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
  listEl.querySelectorAll('[data-action="toggle-episodes"]').forEach(btn => {
    btn.addEventListener('click', () => handleEpisodesToggle(btn));
  });
  // Any series that render already-expanded (state survives a full list
  // re-render, e.g. after creating a new series) need their Add Episode
  // form's submit handler re-attached too, same as the toggle above.
  adminExpandedSeries.forEach(seriesId => wireEpisodesPanel(seriesId));
}

// Expand/collapse one series' episode list. Fetches lazily (only on
// first expand) and caches in adminEpisodes so flipping the row closed
// and back open never re-fetches. Collapsing empties the panel's DOM
// (cheap) but keeps the cached data, so re-expanding is instant.
async function handleEpisodesToggle(btn){
  const seriesId = btn.dataset.seriesId;
  const panelEl = document.getElementById('episodesPanel-' + seriesId);
  if(!panelEl) return;

  if(adminExpandedSeries.has(seriesId)){
    adminExpandedSeries.delete(seriesId);
    panelEl.hidden = true;
    panelEl.innerHTML = '';
    btn.textContent = '▸ Episodes';
    return;
  }

  adminExpandedSeries.add(seriesId);
  btn.textContent = '▾ Episodes';
  panelEl.hidden = false;

  if(adminEpisodes[seriesId] === undefined){
    panelEl.innerHTML = '<div class="admin-empty">Loading episodes…</div>';
    await loadEpisodesForSeries(seriesId);
  }

  renderEpisodesPanel(seriesId);
}

async function loadEpisodesForSeries(seriesId){
  try {
    const { data, error } = await supabaseClient
      .from('episodes')
      .select('id, episode_number, title, bunny_video_id, duration_seconds')
      .eq('series_id', seriesId)
      .order('episode_number', { ascending: true });
    if(error) throw error;
    adminEpisodes[seriesId] = data || [];
  } catch(err){
    console.error('Narrava: failed to load episodes', err);
    adminEpisodes[seriesId] = [];
    showToast('Could not load episodes — please try again');
  }
}

function renderEpisodesPanel(seriesId){
  const panelEl = document.getElementById('episodesPanel-' + seriesId);
  if(!panelEl) return;
  panelEl.innerHTML = episodesPanelHtml(seriesId);
  wireEpisodesPanel(seriesId);
}

function wireEpisodesPanel(seriesId){
  const formEl = document.getElementById('addEpisodeForm-' + seriesId);
  if(formEl) formEl.addEventListener('submit', handleAddEpisodeSubmit);
}

function renderAdminPanel(){
  adminPanel.innerHTML =
    adminHeaderHtml() +
    '<div id="adminStats">' + statsHtml() + '</div>' +
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
    const [seriesResult, genreResult, linkResult, usersResult, revenueResult] = await Promise.all([
      supabaseClient.from('series').select('id, title, description, cover_image_url, free_episode_count, featured_at').order('created_at', { ascending: false }),
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

// The full upload flow, in the exact order it has to happen:
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

    if(!adminEpisodes[seriesId]) adminEpisodes[seriesId] = [];
    adminEpisodes[seriesId].push(epData);
    adminEpisodes[seriesId].sort((a, b) => a.episode_number - b.episode_number);

    showToast('Episode uploaded ✓ — Bunny may take a few minutes to finish processing');
    renderEpisodesPanel(seriesId);
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

// Entry point, called from profile.js when the Admin Panel row is tapped.
async function renderAdminScreen(){
  adminPanel.innerHTML = '<div class="admin-empty">Loading…</div>';
  await loadAdminData();
  renderAdminPanel();
}
