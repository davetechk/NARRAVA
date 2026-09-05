// admin-episodes.js — admin/episodes.html only.

let epAllEpisodes = []; // [{id, series_id, episode_number, title, bunny_video_id, duration_seconds, created_at}]
let epSeriesById = {};  // series_id -> series row (id, title, ...)
let epSearchQuery = '';
let epEditingId = null;
let epDeletingId = null;

function formatDuration(seconds){
  if(seconds === null || seconds === undefined) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + String(s).padStart(2, '0');
}

function formatUploadDate(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function filteredEpisodes(){
  const q = epSearchQuery.trim().toLowerCase();
  if(!q) return epAllEpisodes;
  return epAllEpisodes.filter(ep => {
    const series = epSeriesById[ep.series_id];
    const haystack = (ep.title || '') + ' ' + (series ? series.title : '');
    return haystack.toLowerCase().includes(q);
  });
}

function episodeRowHtml(ep){
  if(epEditingId === ep.id) return editRowHtml(ep);
  if(epDeletingId === ep.id) return deleteRowHtml(ep);

  const series = epSeriesById[ep.series_id];
  const hasVideo = !!ep.bunny_video_id;

  return '<tr data-episode-id="' + ep.id + '">' +
    '<td><div class="admin-row-cell"><div class="admin-thumb small"></div><div><div class="admin-row-title">' + (ep.title ? escapeHtml(ep.title) : 'Untitled') + '</div><div class="admin-row-sub">' + (series ? escapeHtml(series.title) : 'Unknown series') + ' · Ep ' + ep.episode_number + '</div></div></div></td>' +
    '<td>' + formatDuration(ep.duration_seconds) + '</td>' +
    '<td><span class="admin-badge ' + (hasVideo ? 'green' : 'gray') + '">' + (hasVideo ? 'Video attached' : 'No video') + '</span></td>' +
    '<td class="admin-row-sub">' + formatUploadDate(ep.created_at) + '</td>' +
    '<td>' +
      '<div class="admin-action-group">' +
        '<button type="button" class="admin-icon-btn" title="Edit" data-action="edit" data-episode-id="' + ep.id + '">' + ADMIN_ICONS.edit + '</button>' +
        '<button type="button" class="admin-icon-btn delete" title="Delete" data-action="delete" data-episode-id="' + ep.id + '">' + ADMIN_ICONS.del + '</button>' +
      '</div>' +
    '</td>' +
  '</tr>';
}

function editRowHtml(ep){
  return '<tr data-episode-id="' + ep.id + '"><td colspan="5">' +
    '<div class="admin-inline-form">' +
      '<div class="auth-error" id="epEditError-' + ep.id + '"></div>' +
      '<form id="epEditForm-' + ep.id + '" data-episode-id="' + ep.id + '" novalidate>' +
        '<div class="admin-inline-form-row">' +
          '<div><label class="auth-label" for="epEditNumber-' + ep.id + '">Episode #</label><input class="auth-input" type="number" min="1" id="epEditNumber-' + ep.id + '" value="' + ep.episode_number + '" required></div>' +
          '<div><label class="auth-label" for="epEditTitle-' + ep.id + '">Title</label><input class="auth-input" type="text" id="epEditTitle-' + ep.id + '" value="' + escapeHtml(ep.title || '') + '"></div>' +
        '</div>' +
        '<div class="admin-helper-text">Editing here only changes the episode\'s number and title — the video file itself isn\'t replaced. To swap the video, delete this episode and upload it again.</div>' +
        '<div class="admin-inline-form-actions">' +
          '<button class="auth-submit" type="submit" id="epEditSubmit-' + ep.id + '">Save Changes</button>' +
          '<button type="button" class="admin-inline-cancel" data-action="cancel-edit">Cancel</button>' +
        '</div>' +
      '</form>' +
    '</div>' +
  '</td></tr>';
}

function deleteRowHtml(ep){
  const series = epSeriesById[ep.series_id];
  return '<tr data-episode-id="' + ep.id + '"><td colspan="5">' +
    '<div class="admin-delete-confirm">' +
      '<p>Delete Ep ' + ep.episode_number + (ep.title ? ' — “' + escapeHtml(ep.title) + '”' : '') + (series ? ' from “' + escapeHtml(series.title) + '”' : '') + '? This removes the episode record from Narrava. It does <strong>not</strong> delete the actual video file on Bunny — there\'s no way to do that from this app yet, only the database row goes away. This can’t be undone.</p>' +
      '<div class="admin-delete-confirm-actions">' +
        '<button type="button" class="admin-delete-confirm-btn" data-action="confirm-delete" data-episode-id="' + ep.id + '">Delete Permanently</button>' +
        '<button type="button" class="admin-delete-cancel-btn" data-action="cancel-delete">Cancel</button>' +
      '</div>' +
    '</div>' +
  '</td></tr>';
}

function renderTable(){
  const wrap = document.getElementById('episodesTableWrap');
  document.getElementById('epCountSub').textContent = epAllEpisodes.length + ' episode' + (epAllEpisodes.length === 1 ? '' : 's') + ' across ' + Object.keys(epSeriesById).length + ' series';

  if(!epAllEpisodes.length){
    wrap.innerHTML = '<div class="admin-empty">No episodes yet — upload the first one above.</div>';
    return;
  }
  const list = filteredEpisodes();
  if(!list.length){
    wrap.innerHTML = '<div class="admin-empty">No episodes match “' + escapeHtml(epSearchQuery) + '”.</div>';
    return;
  }
  wrap.innerHTML = '<div class="admin-table-wrap"><table class="admin-table">' +
    '<thead><tr><th>Episode</th><th>Duration</th><th>Status</th><th>Uploaded</th><th>Actions</th></tr></thead>' +
    '<tbody>' + list.map(episodeRowHtml).join('') + '</tbody>' +
  '</table></div>';
  wireTableActions();
}

function wireTableActions(){
  const wrap = document.getElementById('episodesTableWrap');
  wrap.querySelectorAll('[data-action="edit"]').forEach(btn => btn.addEventListener('click', () => { epEditingId = btn.dataset.episodeId; epDeletingId = null; renderTable(); }));
  wrap.querySelectorAll('[data-action="cancel-edit"]').forEach(btn => btn.addEventListener('click', () => { epEditingId = null; renderTable(); }));
  wrap.querySelectorAll('[data-action="delete"]').forEach(btn => btn.addEventListener('click', () => { epDeletingId = btn.dataset.episodeId; epEditingId = null; renderTable(); }));
  wrap.querySelectorAll('[data-action="cancel-delete"]').forEach(btn => btn.addEventListener('click', () => { epDeletingId = null; renderTable(); }));
  wrap.querySelectorAll('[data-action="confirm-delete"]').forEach(btn => btn.addEventListener('click', () => handleDelete(btn)));
  wrap.querySelectorAll('form[id^="epEditForm-"]').forEach(form => form.addEventListener('submit', handleEditSubmit));
}

async function handleEditSubmit(e){
  e.preventDefault();
  const form = e.currentTarget;
  const epId = form.dataset.episodeId;
  const errorEl = document.getElementById('epEditError-' + epId);
  const submitBtn = document.getElementById('epEditSubmit-' + epId);

  const episodeNumber = parseInt(document.getElementById('epEditNumber-' + epId).value, 10);
  const title = document.getElementById('epEditTitle-' + epId).value.trim();

  errorEl.textContent = '';
  errorEl.classList.remove('show');

  if(!episodeNumber || episodeNumber < 1){
    errorEl.textContent = 'Enter a valid episode number.';
    errorEl.classList.add('show');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving…';

  try {
    const { data, error } = await supabaseClient
      .from('episodes')
      .update({ episode_number: episodeNumber, title: title || null })
      .eq('id', epId)
      .select('id, series_id, episode_number, title, bunny_video_id, duration_seconds, created_at')
      .single();
    if(error) throw error;

    const idx = epAllEpisodes.findIndex(ep => String(ep.id) === String(epId));
    if(idx !== -1) epAllEpisodes[idx] = data;

    epEditingId = null;
    showToast('Episode updated ✓');
    renderTable();
  } catch(err){
    console.error('Narrava: failed to update episode', err);
    errorEl.textContent = err.message || 'Could not save changes — please try again.';
    errorEl.classList.add('show');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Changes';
  }
}

async function handleDelete(btn){
  const epId = btn.dataset.episodeId;
  btn.disabled = true;
  btn.textContent = 'Deleting…';
  try {
    const { error } = await supabaseClient.from('episodes').delete().eq('id', epId);
    if(error) throw error;

    epAllEpisodes = epAllEpisodes.filter(ep => String(ep.id) !== String(epId));
    epDeletingId = null;
    showToast('Episode record deleted ✓ — the video file on Bunny was not removed');
    renderTable();
  } catch(err){
    console.error('Narrava: failed to delete episode', err);
    showToast('Could not delete episode — please try again');
    btn.disabled = false;
    btn.textContent = 'Delete Permanently';
  }
}

function populateSeriesSelect(preselectId){
  const select = document.getElementById('epUploadSeries');
  const series = Object.values(epSeriesById).sort((a, b) => a.title.localeCompare(b.title));
  select.innerHTML = '<option value="">Choose a series…</option>' +
    series.map(s => '<option value="' + s.id + '"' + (String(s.id) === String(preselectId) ? ' selected' : '') + '>' + escapeHtml(s.title) + '</option>').join('');
}

document.getElementById('epUploadFileBtn').addEventListener('click', () => {
  document.getElementById('epUploadFile').click();
});
document.getElementById('epUploadFile').addEventListener('change', () => {
  const file = document.getElementById('epUploadFile').files[0];
  document.getElementById('epUploadFileBtn').textContent = file ? ('✓ ' + file.name) : 'Add Video File';
});

async function handleUploadSubmit(e){
  e.preventDefault();

  const seriesId = document.getElementById('epUploadSeries').value;
  const series = epSeriesById[seriesId];
  const episodeNumber = parseInt(document.getElementById('epUploadNumber').value, 10);
  const title = document.getElementById('epUploadTitle').value.trim();
  const file = document.getElementById('epUploadFile').files[0];
  const errorEl = document.getElementById('epUploadError');

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
    submitBtn: document.getElementById('epUploadSubmit'),
    progressWrap: document.getElementById('epUploadProgress'),
    progressFill: document.getElementById('epUploadProgressFill'),
    progressLabel: document.getElementById('epUploadProgressLabel')
  };

  try {
    const epData = await uploadEpisodeToBunny({ seriesId, seriesTitle: series.title, episodeNumber, title, file }, els);
    epAllEpisodes.unshift(epData);
    showToast('Episode uploaded ✓ — Bunny may take a few minutes to finish processing');
    document.getElementById('epUploadForm').reset();
    document.getElementById('epUploadFileBtn').textContent = 'Add Video File';
    document.getElementById('epUploadNumber').value = 1;
    populateSeriesSelect(seriesId);
    els.progressWrap.classList.remove('show');
    renderTable();
  } catch(err){
    errorEl.textContent = err.message;
    errorEl.classList.add('show');
  }
}

document.getElementById('epUploadForm').addEventListener('submit', handleUploadSubmit);
document.getElementById('episodesSearch').addEventListener('input', (e) => {
  epSearchQuery = e.target.value;
  renderTable();
});

(async () => {
  await requireAdminSession('episodes');

  const params = new URLSearchParams(window.location.search);
  const preselectSeries = params.get('series');

  try {
    const [core, episodesResult] = await Promise.all([
      loadCoreAdminData(),
      supabaseClient.from('episodes').select('id, series_id, episode_number, title, bunny_video_id, duration_seconds, created_at').order('created_at', { ascending: false })
    ]);
    if(episodesResult.error) throw episodesResult.error;

    epSeriesById = {};
    core.series.forEach(s => { epSeriesById[s.id] = s; });
    epAllEpisodes = episodesResult.data || [];

    populateSeriesSelect(preselectSeries);
    renderTable();
  } catch(err){
    console.error('Narrava: failed to load episodes', err);
    showToast('Could not load episodes — please try again');
  }
})();
