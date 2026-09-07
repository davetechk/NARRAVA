// admin-dashboard.js — admin/dashboard.html only.

let dashSeries = [];
let dashGenres = [];
let dashSeriesGenres = {};
let dashSearchQuery = '';
let dashCoverFile = null;

function resetDashCoverPicker(){
  dashCoverFile = null;
  document.getElementById('adminCoverPreview').style.backgroundImage = '';
  document.getElementById('adminCoverFileBtn').textContent = 'Choose Image';
  document.getElementById('adminCoverFile').value = '';
}
document.getElementById('adminCoverFileBtn').addEventListener('click', () => {
  document.getElementById('adminCoverFile').click();
});
document.getElementById('adminCoverFile').addEventListener('change', () => {
  const file = document.getElementById('adminCoverFile').files[0];
  dashCoverFile = file || null;
  document.getElementById('adminCoverPreview').style.backgroundImage = file ? "url('" + URL.createObjectURL(file) + "')" : '';
  document.getElementById('adminCoverFileBtn').textContent = file ? ('✓ ' + file.name) : 'Choose Image';
});

function statsRowHtml(totalUsers, totalRevenue){
  const totalSeries = dashSeries.length;
  const totalGenres = dashGenres.length;
  const featuredNow = dashSeries.filter(s => !!s.featured_at).length;
  const usersDisplay = (totalUsers === null || totalUsers === undefined) ? '—' : totalUsers;
  const revenueDisplay = (totalRevenue === null || totalRevenue === undefined) ? '—' : formatNaira(totalRevenue);

  return '<div class="admin-stats-row">' +
    '<div class="admin-stat-card"><div class="admin-stat-icon">' + ADMIN_ICONS.dashboard + '</div><div class="admin-stat-body"><div class="admin-stat-label">Total Series</div><div class="admin-stat-value">' + totalSeries + '</div><div class="admin-stat-caption">Live on Narrava</div></div></div>' +
    '<div class="admin-stat-card"><div class="admin-stat-icon">' + ADMIN_ICONS.content + '</div><div class="admin-stat-body"><div class="admin-stat-label">Total Genres</div><div class="admin-stat-value">' + totalGenres + '</div><div class="admin-stat-caption">Content categories</div></div></div>' +
    '<div class="admin-stat-card"><div class="admin-stat-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.1 6.6L12 17.6l-5.8 3 1.1-6.6-4.8-4.6 6.6-.9 2.9-6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg></div><div class="admin-stat-body"><div class="admin-stat-label">Featured Now</div><div class="admin-stat-value">' + featuredNow + '</div><div class="admin-stat-caption">Discover carousel</div></div></div>' +
    '<div class="admin-stat-card"><div class="admin-stat-icon">' + ADMIN_ICONS.users + '</div><div class="admin-stat-body"><div class="admin-stat-label">Registered Users</div><div class="admin-stat-value">' + usersDisplay + '</div><div class="admin-stat-caption">Signed-up accounts</div></div></div>' +
    '<div class="admin-stat-card"><div class="admin-stat-icon">' + ADMIN_ICONS.revenue + '</div><div class="admin-stat-body"><div class="admin-stat-label">Total Revenue</div><div class="admin-stat-value">' + revenueDisplay + '</div><div class="admin-stat-caption">Lifetime</div></div></div>' +
  '</div>';
}

function dashFilteredSeries(){
  const q = dashSearchQuery.trim().toLowerCase();
  const list = q ? dashSeries.filter(s => s.title.toLowerCase().includes(q)) : dashSeries;
  return list.slice(0, 5);
}

function seriesPreviewRowHtml(series){
  const genreIds = dashSeriesGenres[series.id] || new Set();
  const isFeatured = !!series.featured_at;
  const cover = series.cover_image_url ? 'background-image:url(\'' + series.cover_image_url.replace(/'/g, '') + '\');' : '';

  return '<tr>' +
    '<td><div class="admin-row-cell"><div class="admin-thumb" style="' + cover + '"></div><span class="admin-row-title">' + escapeHtml(series.title) + '</span></div></td>' +
    '<td>' + genreTagsHtml(dashGenres, genreIds) + '</td>' +
    '<td><button type="button" class="admin-switch' + (isFeatured ? ' on' : '') + '" data-series-id="' + series.id + '" aria-label="Toggle featured"></button></td>' +
    '<td><a class="admin-btn-link" href="episodes.html?series=' + series.id + '">Add Episode</a></td>' +
  '</tr>';
}

function renderSeriesPreview(){
  const el = document.getElementById('adminSeriesPreview');
  if(!dashSeries.length){
    el.innerHTML = '<div class="admin-empty">No series yet — create the first one above.</div>';
    return;
  }
  const list = dashFilteredSeries();
  if(!list.length){
    el.innerHTML = '<div class="admin-empty">No series match “' + escapeHtml(dashSearchQuery) + '”.</div>';
    return;
  }
  el.innerHTML = '<div class="admin-table-wrap"><table class="admin-table">' +
    '<thead><tr><th>Series</th><th>Genres</th><th>Featured</th><th>Actions</th></tr></thead>' +
    '<tbody>' + list.map(seriesPreviewRowHtml).join('') + '</tbody>' +
  '</table></div>';

  el.querySelectorAll('.admin-switch').forEach(btn => {
    btn.addEventListener('click', () => handleFeaturedToggle(btn));
  });
}

async function handleFeaturedToggle(btn){
  const seriesId = btn.dataset.seriesId;
  const series = dashSeries.find(s => String(s.id) === String(seriesId));
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
    btn.classList.toggle('on', !!series.featured_at);
    showToast(series.featured_at ? 'Marked as featured ✓' : 'Removed from featured');
  } catch(err){
    console.error('Narrava: failed to toggle featured', err);
    showToast('Could not update featured status — please try again');
  } finally {
    btn.disabled = false;
  }
}

function populateUploadSeriesSelect(){
  const select = document.getElementById('dashUploadSeries');
  select.innerHTML = '<option value="">Choose a series…</option>' +
    dashSeries.map(s => '<option value="' + s.id + '">' + escapeHtml(s.title) + '</option>').join('');
}

async function handleCreateSeriesSubmit(e){
  e.preventDefault();
  const form = e.currentTarget;

  const title = document.getElementById('adminTitle').value.trim();
  const description = document.getElementById('adminDescription').value.trim();
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
    let coverImageUrl = null;
    if(dashCoverFile){
      submitBtn.textContent = 'Uploading image…';
      coverImageUrl = await uploadCoverImageFile(dashCoverFile);
      submitBtn.textContent = 'Creating…';
    }

    const { data, error } = await supabaseClient
      .from('series')
      .insert({ title, description, cover_image_url: coverImageUrl, free_episode_count: freeEpisodeCount })
      .select('id, title, description, cover_image_url, free_episode_count, featured_at, status')
      .single();
    if(error) throw error;

    dashSeries.unshift(data);
    showToast('Series created ✓ — it starts as a draft, publish it from Series List when ready');
    form.reset();
    document.getElementById('adminFreeEpisodes').value = 10;
    resetDashCoverPicker();
    renderSeriesPreview();
    populateUploadSeriesSelect();
  } catch(err){
    console.error('Narrava: failed to create series', err);
    errorEl.textContent = err.message || 'Could not create series — please try again.';
    errorEl.classList.add('show');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Series';
  }
}

document.getElementById('dashUploadFileBtn').addEventListener('click', () => {
  document.getElementById('dashUploadFile').click();
});
document.getElementById('dashUploadFile').addEventListener('change', () => {
  const file = document.getElementById('dashUploadFile').files[0];
  document.getElementById('dashUploadFileBtn').textContent = file ? ('✓ ' + file.name) : 'Add Video File';
});

async function handleDashUploadSubmit(e){
  e.preventDefault();

  const seriesId = document.getElementById('dashUploadSeries').value;
  const series = dashSeries.find(s => String(s.id) === String(seriesId));
  const episodeNumber = parseInt(document.getElementById('dashUploadNumber').value, 10);
  const title = document.getElementById('dashUploadTitle').value.trim();
  const file = document.getElementById('dashUploadFile').files[0];
  const errorEl = document.getElementById('dashUploadError');

  errorEl.textContent = '';
  errorEl.classList.remove('show');

  if(!series){
    errorEl.textContent = 'Choose a series first.';
    errorEl.classList.add('show');
    return;
  }
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

  const els = {
    submitBtn: document.getElementById('dashUploadSubmit'),
    progressWrap: document.getElementById('dashUploadProgress'),
    progressFill: document.getElementById('dashUploadProgressFill'),
    progressLabel: document.getElementById('dashUploadProgressLabel')
  };

  try {
    await uploadEpisodeToBunny({ seriesId, seriesTitle: series.title, episodeNumber, title, file }, els);
    showToast('Episode uploaded ✓ — Bunny may take a few minutes to finish processing');
    document.getElementById('dashUploadForm').reset();
    document.getElementById('dashUploadFileBtn').textContent = 'Add Video File';
    document.getElementById('dashUploadNumber').value = 1;
    els.progressWrap.classList.remove('show');
  } catch(err){
    errorEl.textContent = err.message;
    errorEl.classList.add('show');
  }
}

document.getElementById('adminCreateForm').addEventListener('submit', handleCreateSeriesSubmit);
document.getElementById('dashUploadForm').addEventListener('submit', handleDashUploadSubmit);
document.getElementById('adminDashboardSearch').addEventListener('input', (e) => {
  dashSearchQuery = e.target.value;
  renderSeriesPreview();
});

(async () => {
  await requireAdminSession('dashboard');

  try {
    const [core, usersResult, revenueResult] = await Promise.all([
      loadCoreAdminData(),
      supabaseClient.rpc('admin_total_users'),
      supabaseClient.rpc('admin_total_revenue')
    ]);
    dashSeries = core.series;
    dashGenres = core.genres;
    dashSeriesGenres = core.seriesGenres;

    const totalUsers = usersResult.error ? null : usersResult.data;
    const totalRevenue = revenueResult.error ? null : revenueResult.data;
    if(usersResult.error) console.error('Narrava: admin_total_users failed', usersResult.error);
    if(revenueResult.error) console.error('Narrava: admin_total_revenue failed', revenueResult.error);

    document.getElementById('adminStatsRow').innerHTML = statsRowHtml(totalUsers, totalRevenue);
    renderSeriesPreview();
    populateUploadSeriesSelect();
  } catch(err){
    console.error('Narrava: failed to load dashboard data', err);
    showToast('Could not load dashboard data — please try again');
  }
})();
