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
  const label = 'Ep ' + ep.episode_number + (ep.title ? ' — “' + escapeHtml(ep.title) + '”' : '') + (series ? ' from “' + escapeHtml(series.title) + '”' : '');
  const warning = ep.bunny_video_id
    ? 'Delete ' + label + '? This removes the episode record from Narrava <strong>and</strong> deletes the actual video file from Bunny — both go away for good. This can’t be undone.'
    : 'Delete ' + label + '? This episode has no video attached, so this only removes the episode record from Narrava. This can’t be undone.';
  return '<tr data-episode-id="' + ep.id + '"><td colspan="5">' +
    '<div class="admin-delete-confirm">' +
      '<p>' + warning + '</p>' +
      '<div class="auth-error" id="epDeleteError-' + ep.id + '"></div>' +
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

// Real delete, both halves together: the actual video asset on Bunny
// (via deleteBunnyVideo — admin-shared.js, the already-deployed
// bunny-delete-video function) and the database row. Bunny goes first,
// on purpose — if it fails, the database row is left completely alone
// rather than silently deleting the record and pretending the video
// went with it. An episode with no video attached (bunny_video_id
// null) skips straight to the database delete, since there's nothing
// real on Bunny to remove.
async function handleDelete(btn){
  const epId = btn.dataset.episodeId;
  const ep = epAllEpisodes.find(e => String(e.id) === String(epId));
  const errorEl = document.getElementById('epDeleteError-' + epId);
  if(errorEl){ errorEl.textContent = ''; errorEl.classList.remove('show'); }

  btn.disabled = true;
  btn.textContent = 'Deleting…';

  if(ep && ep.bunny_video_id){
    try {
      await deleteBunnyVideo(ep.bunny_video_id);
    } catch(err){
      console.error('Narrava: failed to delete video from Bunny — episode record left untouched', err);
      if(errorEl){
        errorEl.textContent = 'Could not delete the video from Bunny: ' + (err.message || 'please try again') + '. The episode record was not deleted either.';
        errorEl.classList.add('show');
      } else {
        showToast('Could not delete the video from Bunny — the episode record was not deleted either');
      }
      btn.disabled = false;
      btn.textContent = 'Delete Permanently';
      return;
    }
  }

  try {
    const { error } = await supabaseClient.from('episodes').delete().eq('id', epId);
    if(error) throw error;

    epAllEpisodes = epAllEpisodes.filter(e => String(e.id) !== String(epId));
    epDeletingId = null;
    showToast('Episode deleted ✓' + (ep && ep.bunny_video_id ? ' — the video on Bunny was removed too' : ''));
    renderTable();
  } catch(err){
    console.error('Narrava: video deleted from Bunny, but the episode record could not be deleted', err);
    const message = ep && ep.bunny_video_id
      ? 'The video was deleted from Bunny, but the episode record could not be deleted: ' + (err.message || 'please try again') + '. Try deleting again to remove the leftover record.'
      : 'Could not delete the episode record: ' + (err.message || 'please try again');
    if(errorEl){
      errorEl.textContent = message;
      errorEl.classList.add('show');
    } else {
      showToast(message);
    }
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

// ============ Batch upload queue ============
//
// Reuses uploadEpisodeToBunny (admin-shared.js) completely unchanged —
// same bunny-upload-init permission step, same tus upload to Bunny, same
// "only save the episode row after a genuine success" rule, per file.
// This only adds the queueing/tracking around that one already-tested
// function: real per-file progress (each row gets its own progressFill,
// not one shared bar), auto-assigned consecutive episode numbers, and an
// honest per-file result — a batch is never reported "done" if any file
// in it actually failed.

let epQueue = []; // [{file, number, title, status: 'pending'|'uploading'|'done'|'error', errorMessage}]

function nextEpisodeNumberForSeries(seriesId){
  const nums = epAllEpisodes
    .filter(ep => String(ep.series_id) === String(seriesId))
    .map(ep => ep.episode_number);
  return nums.length ? Math.max(...nums) + 1 : 1;
}

function renderUploadQueue(){
  const wrap = document.getElementById('epUploadQueue');
  const submitBtn = document.getElementById('epUploadSubmit');

  if(!epQueue.length){
    wrap.innerHTML = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Add video files to begin';
    return;
  }

  const statusLabel = { pending: 'Pending', uploading: 'Uploading…', done: '✓ Uploaded', error: '✗ Failed' };

  wrap.innerHTML = epQueue.map((item, i) => {
    const locked = item.status === 'uploading' || item.status === 'done';
    return '<div class="admin-batch-row' + (item.status === 'error' ? ' error' : '') + '">' +
      '<div class="admin-batch-row-name" title="' + escapeHtml(item.file.name) + '">' + escapeHtml(item.file.name) + '</div>' +
      '<input type="number" min="1" class="epq-number" data-index="' + i + '" value="' + item.number + '"' + (locked ? ' disabled' : '') + '>' +
      '<input type="text" class="epq-title" data-index="' + i + '" placeholder="Episode name (optional)" value="' + escapeHtml(item.title) + '"' + (locked ? ' disabled' : '') + '>' +
      '<div class="admin-batch-row-progress"><div class="admin-progress-track"><div class="admin-progress-fill" id="epqProgressFill-' + i + '"></div></div></div>' +
      '<div class="admin-batch-row-status ' + item.status + '" id="epqStatus-' + i + '">' + statusLabel[item.status] + '</div>' +
      (item.status === 'error' ? '<div class="admin-batch-row-error">' + escapeHtml(item.errorMessage || 'Upload failed.') + '</div>' : '') +
    '</div>';
  }).join('');

  wrap.querySelectorAll('.epq-number').forEach(inp => inp.addEventListener('input', () => {
    epQueue[parseInt(inp.dataset.index, 10)].number = parseInt(inp.value, 10) || 0;
  }));
  wrap.querySelectorAll('.epq-title').forEach(inp => inp.addEventListener('input', () => {
    epQueue[parseInt(inp.dataset.index, 10)].title = inp.value;
  }));

  const eligible = epQueue.filter(it => it.status === 'pending' || it.status === 'error');
  submitBtn.disabled = eligible.length === 0;
  if(eligible.length === epQueue.length){
    submitBtn.textContent = 'Upload ' + epQueue.length + ' Episode' + (epQueue.length === 1 ? '' : 's');
  } else if(eligible.length > 0){
    submitBtn.textContent = 'Retry ' + eligible.length + ' Remaining';
  } else {
    submitBtn.textContent = 'All Uploaded ✓';
  }
}

document.getElementById('epUploadFileBtn').addEventListener('click', () => {
  document.getElementById('epUploadFile').click();
});
document.getElementById('epUploadFile').addEventListener('change', () => {
  const files = Array.from(document.getElementById('epUploadFile').files);
  if(!files.length) return;

  const seriesId = document.getElementById('epUploadSeries').value;
  let nextNum = seriesId ? nextEpisodeNumberForSeries(seriesId) : 1;

  epQueue = files.map(file => ({ file, number: nextNum++, title: '', status: 'pending', errorMessage: null }));
  document.getElementById('epUploadFileBtn').textContent = files.length + ' file' + (files.length === 1 ? '' : 's') + ' selected — choose again to replace';
  renderUploadQueue();
});

// Re-numbers only the still-pending rows if the series is chosen (or
// changed) after files are already queued — never touches a row that's
// already uploading, done, or that failed (its number stays put so a
// retry doesn't silently renumber something the admin may have already
// fixed by hand).
document.getElementById('epUploadSeries').addEventListener('change', () => {
  if(!epQueue.length) return;
  const seriesId = document.getElementById('epUploadSeries').value;
  if(!seriesId) return;
  let nextNum = nextEpisodeNumberForSeries(seriesId);
  epQueue.forEach(item => {
    if(item.status === 'pending'){ item.number = nextNum; nextNum++; }
  });
  renderUploadQueue();
});

// Adapts one queue row's own DOM elements into the exact {submitBtn,
// progressWrap, progressFill, progressLabel} shape uploadEpisodeToBunny
// already expects — submitBtn/progressLabel both point at the row's own
// status text (only .disabled/.textContent are ever touched on it, both
// safe on a plain <div>), progressWrap is a harmless no-op stand-in since
// each row's progress bar is always visible, never hidden/shown.
async function uploadOneQueuedEpisode(item, seriesId, seriesTitle){
  const idx = epQueue.indexOf(item);
  const statusEl = document.getElementById('epqStatus-' + idx);
  const progressFill = document.getElementById('epqProgressFill-' + idx);
  const els = {
    submitBtn: statusEl,
    progressWrap: { classList: { add(){}, remove(){} } },
    progressFill: progressFill,
    progressLabel: statusEl
  };

  try {
    const epData = await uploadEpisodeToBunny({ seriesId, seriesTitle, episodeNumber: item.number, title: item.title.trim(), file: item.file }, els);
    item.status = 'done';
    epAllEpisodes.unshift(epData);
  } catch(err){
    console.error('Narrava: batch episode upload failed for ' + item.file.name, err);
    item.status = 'error';
    item.errorMessage = err.message || 'Upload failed.';
    throw err;
  }
}

async function handleUploadSubmit(e){
  e.preventDefault();

  const seriesId = document.getElementById('epUploadSeries').value;
  const series = epSeriesById[seriesId];
  const errorEl = document.getElementById('epUploadError');
  const submitBtn = document.getElementById('epUploadSubmit');
  const summaryEl = document.getElementById('epUploadSummary');

  errorEl.textContent = '';
  errorEl.classList.remove('show');
  summaryEl.textContent = '';
  summaryEl.className = 'admin-batch-summary';

  if(!series){
    errorEl.textContent = 'Choose a series first.';
    errorEl.classList.add('show');
    return;
  }
  if(!epQueue.length){
    errorEl.textContent = 'Choose at least one video file to upload.';
    errorEl.classList.add('show');
    return;
  }

  const numbers = epQueue.map(it => it.number);
  if(numbers.some(n => !n || n < 1)){
    errorEl.textContent = 'Every queued file needs a valid episode number.';
    errorEl.classList.add('show');
    return;
  }
  if(new Set(numbers).size !== numbers.length){
    errorEl.textContent = 'Two queued files share the same episode number — give each one a unique number.';
    errorEl.classList.add('show');
    return;
  }

  const toUpload = epQueue.filter(it => it.status === 'pending' || it.status === 'error');
  if(!toUpload.length) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Uploading ' + toUpload.length + ' episode' + (toUpload.length === 1 ? '' : 's') + '…';
  toUpload.forEach(item => { item.status = 'uploading'; item.errorMessage = null; });
  renderUploadQueue();

  const results = await Promise.allSettled(toUpload.map(item => uploadOneQueuedEpisode(item, seriesId, series.title)));
  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.length - succeeded;

  renderUploadQueue();
  renderTable();

  if(failed === 0){
    summaryEl.textContent = 'All ' + succeeded + ' episode' + (succeeded === 1 ? '' : 's') + ' uploaded ✓';
    summaryEl.classList.add('success');
    showBunnyProcessingToast(succeeded + ' episode' + (succeeded === 1 ? '' : 's') + ' uploaded — Bunny may take a few minutes to finish processing');
    epQueue = [];
    document.getElementById('epUploadFile').value = '';
    document.getElementById('epUploadFileBtn').textContent = 'Add Video Files (select multiple at once)';
    populateSeriesSelect(seriesId);
    renderUploadQueue();
  } else {
    // Never claim this batch is "done" — exactly which files failed (and
    // why) stays visible in the queue above, each one still individually
    // marked, not folded into a single vague error.
    summaryEl.textContent = succeeded + ' of ' + toUpload.length + ' uploaded, ' + failed + ' failed — see below. Fix and press Upload again to retry just the failed ones.';
    summaryEl.classList.add('partial');
    showToast(succeeded + ' of ' + toUpload.length + ' episodes uploaded, ' + failed + ' failed — check the list below');
  }
}

document.getElementById('epUploadForm').addEventListener('submit', handleUploadSubmit);
document.getElementById('episodesSearch').addEventListener('input', (e) => {
  epSearchQuery = e.target.value;
  renderTable();
});

(async () => {
  await requireAdminSession('episodes');
  document.getElementById('episodesTableWrap').innerHTML = narravaLoaderHtml('pulse', 'Loading episodes…');

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
