// admin/series-list.html

let slSeries = [];
let slGenres = [];
let slSeriesGenres = {};
let slEpisodeCounts = {}; // series_id -> number
let slSearchQuery = '';
let slEditingId = null;
let slDeletingId = null;
let slEditCoverFile = null; // Cover file picked in the open edit row, or null

function statsRowHtml(){
  const total = slSeries.length;
  const live = slSeries.filter(s => s.status === 'published').length;
  const draft = total - live;
  const featured = slSeries.filter(s => !!s.featured_at).length;

  return '<div class="admin-stats-row cols-4">' +
    '<div class="admin-stat-card"><div class="admin-stat-icon">' + ADMIN_ICONS.content + '</div><div class="admin-stat-body"><div class="admin-stat-label">Total Series</div><div class="admin-stat-value">' + total + '</div><div class="admin-stat-caption">Across all genres</div></div></div>' +
    '<div class="admin-stat-card"><div class="admin-stat-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="admin-stat-body"><div class="admin-stat-label">Live</div><div class="admin-stat-value">' + live + '</div><div class="admin-stat-caption">Published series</div></div></div>' +
    '<div class="admin-stat-card"><div class="admin-stat-icon orange"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M12 7v5l3.2 2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></div><div class="admin-stat-body"><div class="admin-stat-label">Draft</div><div class="admin-stat-value">' + draft + '</div><div class="admin-stat-caption">Not visible yet</div></div></div>' +
    '<div class="admin-stat-card"><div class="admin-stat-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.1 6.6L12 17.6l-5.8 3 1.1-6.6-4.8-4.6 6.6-.9 2.9-6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg></div><div class="admin-stat-body"><div class="admin-stat-label">Featured</div><div class="admin-stat-value">' + featured + '</div><div class="admin-stat-caption">On discover carousel</div></div></div>' +
  '</div>';
}

function filteredSeries(){
  const q = slSearchQuery.trim().toLowerCase();
  if(!q) return slSeries;
  return slSeries.filter(s => s.title.toLowerCase().includes(q));
}

function seriesRowHtml(series){
  if(slEditingId === series.id) return editRowHtml(series);
  if(slDeletingId === series.id) return deleteRowHtml(series);

  const genreIds = slSeriesGenres[series.id] || new Set();
  const isPublished = series.status === 'published';
  const isFeatured = !!series.featured_at;
  const episodeCount = slEpisodeCounts[series.id] || 0;
  const hasNoEpisodes = episodeCount === 0;
  const cover = series.cover_image_url ? 'background-image:url(\'' + escapeHtml(series.cover_image_url.replace(/'/g, '')) + '\');' : '';

  // A series with no episodes never shows in the app, so flag it
  const noEpisodesNote = hasNoEpisodes
    ? '<div class="admin-row-sub admin-warn-text">No episodes, so it won’t show in the app</div>'
    : '';
  const noEpisodesBadge = hasNoEpisodes
    ? '<span class="admin-warn-badge" title="This series has no real episodes yet, so it will not appear anywhere on the live app regardless of this status.">⚠ Won’t show — no episodes</span>'
    : '';

  return '<tr data-series-id="' + series.id + '">' +
    '<td><div class="admin-row-cell"><div class="admin-thumb" style="' + cover + '"></div><div><span class="admin-row-title">' + escapeHtml(series.title) + '</span>' + noEpisodesNote + '</div></div></td>' +
    '<td>' + genreTagsHtml(slGenres, genreIds) + '</td>' +
    '<td><button type="button" class="admin-badge clickable ' + (isPublished ? 'green' : 'gray') + '" data-action="toggle-published" data-series-id="' + series.id + '">' + (isPublished ? 'Live' : 'Draft') + '</button>' + noEpisodesBadge + '</td>' +
    '<td><button type="button" class="admin-switch' + (isFeatured ? ' on' : '') + '" data-action="toggle-featured" data-series-id="' + series.id + '" aria-label="Toggle featured"></button></td>' +
    '<td>' + episodeCount + '</td>' +
    '<td>' +
      '<div class="admin-action-group">' +
        '<button type="button" class="admin-icon-btn" title="Edit" data-action="edit" data-series-id="' + series.id + '">' + ADMIN_ICONS.edit + '</button>' +
        '<a class="admin-btn-link" href="episodes.html?series=' + series.id + '">Episodes</a>' +
        '<button type="button" class="admin-icon-btn delete" title="Delete" data-action="delete" data-series-id="' + series.id + '">' + ADMIN_ICONS.del + '</button>' +
      '</div>' +
    '</td>' +
  '</tr>';
}

function editRowHtml(series){
  const genreIds = slSeriesGenres[series.id] || new Set();
  return '<tr data-series-id="' + series.id + '"><td colspan="6">' +
    '<div class="admin-inline-form">' +
      '<div class="auth-error" id="editError-' + series.id + '"></div>' +
      '<form id="editForm-' + series.id + '" data-series-id="' + series.id + '" novalidate>' +
        '<div class="admin-inline-form-row">' +
          '<div><label class="auth-label" for="editTitle-' + series.id + '">Title</label><input class="auth-input" type="text" id="editTitle-' + series.id + '" value="' + escapeHtml(series.title) + '" required></div>' +
          '<div><label class="auth-label" for="editFreeEpisodes-' + series.id + '">Free Episode Count</label><input class="auth-input" type="number" min="0" id="editFreeEpisodes-' + series.id + '" value="' + series.free_episode_count + '" required></div>' +
        '</div>' +
        '<label class="auth-label" for="editDescription-' + series.id + '">Description</label>' +
        '<textarea class="auth-input" rows="3" id="editDescription-' + series.id + '" required>' + escapeHtml(series.description) + '</textarea>' +
        '<label class="auth-label">Cover Image</label>' +
        '<div class="admin-cover-picker">' +
          '<div class="admin-cover-preview" id="editCoverPreview-' + series.id + '"' + (series.cover_image_url ? ' style="background-image:url(\'' + escapeHtml(series.cover_image_url.replace(/'/g, '')) + '\')"' : '') + '></div>' +
          '<button type="button" class="admin-btn-link" id="editCoverFileBtn-' + series.id + '">Change Image</button>' +
          '<input type="file" id="editCoverFile-' + series.id + '" accept="image/*" hidden>' +
        '</div>' +
        '<div class="admin-inline-genres"><label>Genres</label><div id="editGenres-' + series.id + '">' + genreChipsEditHtml(series.id, slGenres, genreIds) + '</div></div>' +
        '<div class="admin-inline-form-actions">' +
          '<button class="auth-submit" type="submit" id="editSubmit-' + series.id + '">Save Changes</button>' +
          '<button type="button" class="admin-inline-cancel" data-action="cancel-edit">Cancel</button>' +
        '</div>' +
      '</form>' +
    '</div>' +
  '</td></tr>';
}

function deleteRowHtml(series){
  const episodeCount = slEpisodeCounts[series.id] || 0;
  return '<tr data-series-id="' + series.id + '"><td colspan="6">' +
    '<div class="admin-delete-confirm">' +
      '<p>Delete “' + escapeHtml(series.title) + '” permanently? This deletes its ' + episodeCount + ' episode' + (episodeCount === 1 ? '' : 's') + ' and their Bunny videos, then the series. It stops at the first failure. This can’t be undone.</p>' +
      '<div class="auth-error" id="seriesDeleteError-' + series.id + '"></div>' +
      '<div class="admin-delete-confirm-actions">' +
        '<button type="button" class="admin-delete-confirm-btn" data-action="confirm-delete" data-series-id="' + series.id + '">Delete Permanently</button>' +
        '<button type="button" class="admin-delete-cancel-btn" data-action="cancel-delete">Cancel</button>' +
      '</div>' +
    '</div>' +
  '</td></tr>';
}

function renderTable(){
  const wrap = document.getElementById('seriesListTableWrap');
  if(!slSeries.length){
    wrap.innerHTML = '<div class="admin-empty">No series yet. Create one on the Dashboard.</div>';
    return;
  }
  const list = filteredSeries();
  if(!list.length){
    wrap.innerHTML = '<div class="admin-empty">No series match “' + escapeHtml(slSearchQuery) + '”.</div>';
    return;
  }
  wrap.innerHTML = '<div class="admin-table-wrap"><table class="admin-table">' +
    '<thead><tr><th>Series</th><th>Genres</th><th>Status</th><th>Featured</th><th>Episodes</th><th>Actions</th></tr></thead>' +
    '<tbody>' + list.map(seriesRowHtml).join('') + '</tbody>' +
  '</table></div>';
  wireTableActions();
}

function wireTableActions(){
  const wrap = document.getElementById('seriesListTableWrap');
  wrap.querySelectorAll('[data-action="toggle-published"]').forEach(btn => btn.addEventListener('click', () => handlePublishedToggle(btn)));
  wrap.querySelectorAll('[data-action="toggle-featured"]').forEach(btn => btn.addEventListener('click', () => handleFeaturedToggle(btn)));
  wrap.querySelectorAll('[data-action="edit"]').forEach(btn => btn.addEventListener('click', () => { slEditingId = btn.dataset.seriesId; slDeletingId = null; slEditCoverFile = null; renderTable(); }));
  wrap.querySelectorAll('[data-action="cancel-edit"]').forEach(btn => btn.addEventListener('click', () => { slEditingId = null; slEditCoverFile = null; renderTable(); }));
  wrap.querySelectorAll('[data-action="delete"]').forEach(btn => btn.addEventListener('click', () => { slDeletingId = btn.dataset.seriesId; slEditingId = null; renderTable(); }));
  wrap.querySelectorAll('[data-action="cancel-delete"]').forEach(btn => btn.addEventListener('click', () => { slDeletingId = null; renderTable(); }));
  wrap.querySelectorAll('[data-action="confirm-delete"]').forEach(btn => btn.addEventListener('click', () => handleDelete(btn)));
  wrap.querySelectorAll('form[id^="editForm-"]').forEach(form => {
    form.addEventListener('submit', handleEditSubmit);
    const genresMount = form.querySelector('[id^="editGenres-"]');
    if(genresMount) wireGenreChipsEdit(genresMount, slSeriesGenres);

    const seriesId = form.dataset.seriesId;
    const fileInput = document.getElementById('editCoverFile-' + seriesId);
    const fileBtn = document.getElementById('editCoverFileBtn-' + seriesId);
    const preview = document.getElementById('editCoverPreview-' + seriesId);
    if(fileInput && fileBtn){
      fileBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        slEditCoverFile = file || null;
        if(file){
          preview.style.backgroundImage = "url('" + URL.createObjectURL(file) + "')";
          fileBtn.textContent = '✓ ' + file.name;
        }
      });
    }
  });
}

async function handlePublishedToggle(btn){
  const seriesId = btn.dataset.seriesId;
  const series = slSeries.find(s => String(s.id) === String(seriesId));
  if(!series) return;
  const willPublish = series.status !== 'published';
  btn.disabled = true;
  try {
    const { data, error } = await supabaseClient.from('series').update({ status: willPublish ? 'published' : 'draft' }).eq('id', seriesId).select('status').single();
    if(error) throw error;
    series.status = data.status;
    document.getElementById('seriesListStatsRow').innerHTML = statsRowHtml();
    btn.classList.toggle('green', series.status === 'published');
    btn.classList.toggle('gray', series.status !== 'published');
    btn.textContent = series.status === 'published' ? 'Live' : 'Draft';
    showToast(series.status === 'published' ? 'Series published ✓' : 'Moved to draft (hidden from the app)');
  } catch(err){
    console.error('Narrava: failed to toggle published status', err);
    showToast('Couldn’t update the status. Try again.');
  } finally {
    btn.disabled = false;
  }
}

async function handleFeaturedToggle(btn){
  const seriesId = btn.dataset.seriesId;
  const series = slSeries.find(s => String(s.id) === String(seriesId));
  if(!series) return;
  const willFeature = !series.featured_at;
  btn.disabled = true;
  try {
    const { data, error } = await supabaseClient.from('series').update({ featured_at: willFeature ? new Date().toISOString() : null }).eq('id', seriesId).select('featured_at').single();
    if(error) throw error;
    series.featured_at = data.featured_at;
    document.getElementById('seriesListStatsRow').innerHTML = statsRowHtml();
    btn.classList.toggle('on', !!series.featured_at);
    showToast(series.featured_at ? 'Marked as featured ✓' : 'Removed from featured');
  } catch(err){
    console.error('Narrava: failed to toggle featured', err);
    showToast('Couldn’t update featured. Try again.');
  } finally {
    btn.disabled = false;
  }
}

async function handleEditSubmit(e){
  e.preventDefault();
  const form = e.currentTarget;
  const seriesId = form.dataset.seriesId;
  const errorEl = document.getElementById('editError-' + seriesId);
  const submitBtn = document.getElementById('editSubmit-' + seriesId);

  const title = document.getElementById('editTitle-' + seriesId).value.trim();
  const description = document.getElementById('editDescription-' + seriesId).value.trim();
  const freeEpisodeCountRaw = document.getElementById('editFreeEpisodes-' + seriesId).value;

  errorEl.textContent = '';
  errorEl.classList.remove('show');

  if(!title || !description){
    errorEl.textContent = 'Title and description are required.';
    errorEl.classList.add('show');
    return;
  }

  const freeEpisodeCount = freeEpisodeCountRaw === '' ? 0 : parseInt(freeEpisodeCountRaw, 10);
  const existing = slSeries.find(s => String(s.id) === String(seriesId));
  const previousCoverUrl = existing ? existing.cover_image_url : null;
  const pickedFile = slEditCoverFile;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving…';

  try {
    let coverImageUrl = previousCoverUrl;
    if(pickedFile){
      submitBtn.textContent = 'Uploading image…';
      coverImageUrl = await uploadCoverImageFile(pickedFile);
      submitBtn.textContent = 'Saving…';
    }

    const { data, error } = await supabaseClient
      .from('series')
      .update({ title, description, cover_image_url: coverImageUrl, free_episode_count: freeEpisodeCount })
      .eq('id', seriesId)
      .select('id, title, description, cover_image_url, free_episode_count, featured_at, status')
      .single();
    if(error) throw error;

    const idx = slSeries.findIndex(s => String(s.id) === String(seriesId));
    if(idx !== -1) slSeries[idx] = data;

    // Delete the old cover from storage (only files we uploaded)
    if(pickedFile && previousCoverUrl && previousCoverUrl !== coverImageUrl){
      deleteCoverImageIfOwned(previousCoverUrl);
    }

    slEditingId = null;
    slEditCoverFile = null;
    showToast('Series updated ✓');
    renderTable();
  } catch(err){
    console.error('Narrava: failed to update series', err);
    errorEl.textContent = err.message || 'Couldn’t save changes. Try again.';
    errorEl.classList.add('show');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Changes';
  }
}

// Delete: for each episode, Bunny video then its row; series row last.
// Stops at the first failure; clicking again carries on.
async function handleDelete(btn){
  const seriesId = btn.dataset.seriesId;
  const cancelBtn = btn.parentElement.querySelector('[data-action="cancel-delete"]');
  const errorEl = document.getElementById('seriesDeleteError-' + seriesId);
  const showError = (message) => {
    if(errorEl){ errorEl.textContent = message; errorEl.classList.add('show'); } else { showToast(message); }
  };
  const restore = () => {
    btn.disabled = false;
    btn.textContent = 'Delete Permanently';
    if(cancelBtn) cancelBtn.disabled = false;
  };

  const finishStopped = (message) => {
    renderTable();
    const freshError = document.getElementById('seriesDeleteError-' + seriesId);
    if(freshError){ freshError.textContent = message; freshError.classList.add('show'); } else { showToast(message); }
    const freshBtn = document.querySelector('[data-action="confirm-delete"][data-series-id="' + seriesId + '"]');
    if(freshBtn) freshBtn.textContent = 'Retry Delete';
  };
  const progressNote = (done, count) =>
    done + ' of ' + count + ' episode' + (count === 1 ? ' was' : 's were') + ' already deleted.';

  if(errorEl){ errorEl.textContent = ''; errorEl.classList.remove('show'); }
  btn.disabled = true;
  if(cancelBtn) cancelBtn.disabled = true;
  btn.textContent = 'Checking episodes…';

  // 1. current episode list
  let episodes;
  try {
    const { data, error } = await supabaseClient
      .from('episodes')
      .select('id, episode_number, title, bunny_video_id')
      .eq('series_id', seriesId)
      .order('episode_number', { ascending: true });
    if(error) throw error;
    episodes = data || [];
  } catch(err){
    console.error('Narrava: could not load episodes before deleting series', err);
    showError('Couldn’t load its episodes, so nothing was deleted: ' + (err.message || 'please try again') + '.');
    restore();
    return;
  }

  // 2. every episode: Bunny first, then its record
  const total = episodes.length;
  let removed = 0;
  let videosRemoved = 0;
  for(const ep of episodes){
    const label = 'Episode ' + ep.episode_number + (ep.title ? ' “' + ep.title + '”' : '');
    btn.textContent = 'Deleting episode ' + (removed + 1) + ' of ' + total + '…';

    if(ep.bunny_video_id){
      try {
        await deleteBunnyVideo(ep.bunny_video_id);
        videosRemoved++;
      } catch(err){
        console.error('Narrava: Bunny video delete failed — stopping the series delete', ep, err);
        finishStopped('Stopped at ' + label + ': its Bunny video couldn’t be deleted (' + (err.message || 'unknown error') + '). ' + progressNote(removed, total) + ' Nothing after it was touched. Click Delete Permanently again to carry on.');
        return;
      }
    }

    try {
      const { error } = await supabaseClient.from('episodes').delete().eq('id', ep.id);
      if(error) throw error;
    } catch(err){
      console.error('Narrava: episode record delete failed after its Bunny video was removed', ep, err);
      finishStopped('Stopped at ' + label + ': ' + (ep.bunny_video_id ? 'its Bunny video is gone, but ' : '') + 'its record couldn’t be deleted (' + (err.message || 'unknown error') + '). ' + progressNote(removed, total) + ' Click Delete Permanently again to carry on' + (ep.bunny_video_id ? ' (Bunny may say its video is missing).' : '.'));
      return;
    }

    removed++;
    slEpisodeCounts[seriesId] = Math.max(0, (slEpisodeCounts[seriesId] || 0) - 1);
  }

  // 3. the series row
  btn.textContent = 'Deleting series…';
  try {
    const { data, error } = await supabaseClient.from('series').delete().eq('id', seriesId).select('id');
    if(error) throw error;
    if(!data || !data.length) throw new Error('the database refused');
  } catch(err){
    console.error('Narrava: all episodes were removed but the series row could not be deleted', err);
    finishStopped('All ' + total + ' episode' + (total === 1 ? '' : 's') + ' and their videos were deleted, but the series couldn’t be (' + (err.message || 'unknown error') + '). Click Delete Permanently again to finish.');
    return;
  }

  slSeries = slSeries.filter(s => String(s.id) !== String(seriesId));
  delete slSeriesGenres[seriesId];
  delete slEpisodeCounts[seriesId];
  slDeletingId = null;

  showToast('Series deleted ✓' + (videosRemoved ? ' — ' + videosRemoved + ' video' + (videosRemoved === 1 ? '' : 's') + ' removed from Bunny too' : ''));
  document.getElementById('seriesListStatsRow').innerHTML = statsRowHtml();
  renderTable();
}

document.getElementById('seriesListSearch').addEventListener('input', (e) => {
  slSearchQuery = e.target.value;
  renderTable();
});

(async () => {
  await requireAdminSession('series-list');
  showSkeletonLogo();
  document.getElementById('seriesListTableWrap').innerHTML = skeletonAdminSeriesTableHtml(6);

  try {
    const [core, episodesResult] = await Promise.all([
      loadCoreAdminData(),
      supabaseClient.from('episodes').select('series_id')
    ]);
    slSeries = core.series;
    slGenres = core.genres;
    slSeriesGenres = core.seriesGenres;

    slEpisodeCounts = {};
    if(!episodesResult.error){
      (episodesResult.data || []).forEach(ep => {
        slEpisodeCounts[ep.series_id] = (slEpisodeCounts[ep.series_id] || 0) + 1;
      });
    } else {
      console.error('Narrava: failed to load episode counts', episodesResult.error);
    }

    document.getElementById('seriesListStatsRow').innerHTML = statsRowHtml();
    renderTable();
  } catch(err){
    console.error('Narrava: failed to load series list', err);
    showToast('Couldn’t load series. Try again.');
    document.getElementById('seriesListTableWrap').innerHTML = '<div class="admin-empty">Couldn’t load series. Try again.</div>';
  } finally {
    hideSkeletonLogo();
  }
})();
