// admin-genres.js — admin/genres.html only.

let gGenres = [];       // [{id, name}]
let gSeriesCounts = {}; // genre_id -> number of series carrying it
let gSearchQuery = '';
let gEditingId = null;
let gDeletingId = null;

const GENRE_TAG_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 12l-8 8-9-9V4h7l10 8z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="7.5" cy="7.5" r="1.3" fill="currentColor"/></svg>';

function filteredGenres(){
  const q = gSearchQuery.trim().toLowerCase();
  if(!q) return gGenres;
  return gGenres.filter(g => g.name.toLowerCase().includes(q));
}

function genreCardHtml(genre){
  if(gEditingId === genre.id) return editCardHtml(genre);
  if(gDeletingId === genre.id) return deleteCardHtml(genre);

  const count = gSeriesCounts[genre.id] || 0;
  return '<div class="admin-genre-card" data-genre-id="' + genre.id + '">' +
    '<div class="admin-genre-card-main">' +
      '<div class="admin-genre-card-icon">' + GENRE_TAG_ICON + '</div>' +
      '<div><div class="admin-genre-card-name">' + escapeHtml(genre.name) + '</div><div class="admin-genre-card-count">' + count + ' series tagged</div></div>' +
    '</div>' +
    '<div class="admin-action-group">' +
      '<button type="button" class="admin-icon-btn" title="Edit" data-action="edit" data-genre-id="' + genre.id + '">' + ADMIN_ICONS.edit + '</button>' +
      '<button type="button" class="admin-icon-btn delete" title="Delete" data-action="delete" data-genre-id="' + genre.id + '">' + ADMIN_ICONS.del + '</button>' +
    '</div>' +
  '</div>';
}

function editCardHtml(genre){
  return '<div class="admin-genre-card" data-genre-id="' + genre.id + '" style="display:block;">' +
    '<div class="admin-inline-form">' +
      '<div class="auth-error" id="genreEditError-' + genre.id + '"></div>' +
      '<form id="genreEditForm-' + genre.id + '" data-genre-id="' + genre.id + '" novalidate>' +
        '<label class="auth-label" for="genreEditName-' + genre.id + '">Genre Name</label>' +
        '<input class="auth-input" type="text" id="genreEditName-' + genre.id + '" value="' + escapeHtml(genre.name) + '" required>' +
        '<div class="admin-inline-form-actions">' +
          '<button class="auth-submit" type="submit" id="genreEditSubmit-' + genre.id + '">Save</button>' +
          '<button type="button" class="admin-inline-cancel" data-action="cancel-edit">Cancel</button>' +
        '</div>' +
      '</form>' +
    '</div>' +
  '</div>';
}

function deleteCardHtml(genre){
  const count = gSeriesCounts[genre.id] || 0;
  return '<div class="admin-genre-card" data-genre-id="' + genre.id + '" style="display:block;">' +
    '<div class="admin-delete-confirm">' +
      '<p>Delete “' + escapeHtml(genre.name) + '” permanently? ' + (count ? ('It’s currently tagged on ' + count + ' series — ') : '') + 'this removes it from every series it’s attached to. This can’t be undone.</p>' +
      '<div class="admin-delete-confirm-actions">' +
        '<button type="button" class="admin-delete-confirm-btn" data-action="confirm-delete" data-genre-id="' + genre.id + '">Delete Permanently</button>' +
        '<button type="button" class="admin-delete-cancel-btn" data-action="cancel-delete">Cancel</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function renderGenreList(){
  const heading = document.getElementById('genreListHeading');
  const list = document.getElementById('genreList');

  if(!gGenres.length){
    heading.textContent = 'Content Categories';
    list.innerHTML = '<div class="admin-empty">No genres yet — add the first one above.</div>';
    return;
  }

  const liveCount = gGenres.filter(g => (gSeriesCounts[g.id] || 0) > 0).length;
  heading.textContent = 'Content Categories';
  document.getElementById('genreListSub').textContent = liveCount + ' of ' + gGenres.length + ' genre' + (gGenres.length === 1 ? '' : 's') + ' currently used by at least one series';

  const filtered = filteredGenres();
  if(!filtered.length){
    list.innerHTML = '<div class="admin-empty">No genres match “' + escapeHtml(gSearchQuery) + '”.</div>';
    return;
  }

  list.innerHTML = filtered.map(genreCardHtml).join('');
  wireGenreListActions();
}

function wireGenreListActions(){
  const list = document.getElementById('genreList');
  list.querySelectorAll('[data-action="edit"]').forEach(btn => btn.addEventListener('click', () => { gEditingId = btn.dataset.genreId; gDeletingId = null; renderGenreList(); }));
  list.querySelectorAll('[data-action="cancel-edit"]').forEach(btn => btn.addEventListener('click', () => { gEditingId = null; renderGenreList(); }));
  list.querySelectorAll('[data-action="delete"]').forEach(btn => btn.addEventListener('click', () => { gDeletingId = btn.dataset.genreId; gEditingId = null; renderGenreList(); }));
  list.querySelectorAll('[data-action="cancel-delete"]').forEach(btn => btn.addEventListener('click', () => { gDeletingId = null; renderGenreList(); }));
  list.querySelectorAll('[data-action="confirm-delete"]').forEach(btn => btn.addEventListener('click', () => handleDeleteGenre(btn)));
  list.querySelectorAll('form[id^="genreEditForm-"]').forEach(form => form.addEventListener('submit', handleEditGenreSubmit));
}

async function handleAddGenreSubmit(e){
  e.preventDefault();
  const name = document.getElementById('genreNameInput').value.trim();
  const errorEl = document.getElementById('genreAddError');
  const submitBtn = document.getElementById('genreAddSubmit');

  errorEl.textContent = '';
  errorEl.classList.remove('show');

  if(!name){
    errorEl.textContent = 'Enter a genre name.';
    errorEl.classList.add('show');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Adding…';

  try {
    const { data, error } = await supabaseClient.from('genres').insert({ name }).select('id, name').single();
    if(error) throw error;

    gGenres.push(data);
    gGenres.sort((a, b) => a.name.localeCompare(b.name));
    gSeriesCounts[data.id] = 0;
    showToast('Genre added ✓');
    document.getElementById('genreAddForm').reset();
    renderGenreList();
  } catch(err){
    console.error('Narrava: failed to add genre', err);
    errorEl.textContent = err.message || 'Could not add genre — please try again.';
    errorEl.classList.add('show');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Add Genre';
  }
}

async function handleEditGenreSubmit(e){
  e.preventDefault();
  const form = e.currentTarget;
  const genreId = form.dataset.genreId;
  const errorEl = document.getElementById('genreEditError-' + genreId);
  const submitBtn = document.getElementById('genreEditSubmit-' + genreId);
  const name = document.getElementById('genreEditName-' + genreId).value.trim();

  errorEl.textContent = '';
  errorEl.classList.remove('show');

  if(!name){
    errorEl.textContent = 'Enter a genre name.';
    errorEl.classList.add('show');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving…';

  try {
    const { data, error } = await supabaseClient.from('genres').update({ name }).eq('id', genreId).select('id, name').single();
    if(error) throw error;

    const idx = gGenres.findIndex(g => String(g.id) === String(genreId));
    if(idx !== -1) gGenres[idx] = data;
    gEditingId = null;
    showToast('Genre updated ✓');
    renderGenreList();
  } catch(err){
    console.error('Narrava: failed to update genre', err);
    errorEl.textContent = err.message || 'Could not save changes — please try again.';
    errorEl.classList.add('show');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save';
  }
}

async function handleDeleteGenre(btn){
  const genreId = btn.dataset.genreId;
  btn.disabled = true;
  btn.textContent = 'Deleting…';
  try {
    const { error } = await supabaseClient.from('genres').delete().eq('id', genreId);
    if(error) throw error;

    gGenres = gGenres.filter(g => String(g.id) !== String(genreId));
    delete gSeriesCounts[genreId];
    gDeletingId = null;
    showToast('Genre deleted ✓ — removed from every series it was tagged on');
    renderGenreList();
  } catch(err){
    console.error('Narrava: failed to delete genre', err);
    showToast('Could not delete genre — please try again');
    btn.disabled = false;
    btn.textContent = 'Delete Permanently';
  }
}

document.getElementById('genreAddForm').addEventListener('submit', handleAddGenreSubmit);
document.getElementById('genresSearch').addEventListener('input', (e) => {
  gSearchQuery = e.target.value;
  renderGenreList();
});

(async () => {
  await requireAdminSession('genres');

  try {
    const [genresResult, linksResult] = await Promise.all([
      supabaseClient.from('genres').select('id, name').order('name', { ascending: true }),
      supabaseClient.from('series_genres').select('genre_id')
    ]);
    if(genresResult.error) throw genresResult.error;
    if(linksResult.error) throw linksResult.error;

    gGenres = genresResult.data || [];
    gSeriesCounts = {};
    (linksResult.data || []).forEach(link => {
      gSeriesCounts[link.genre_id] = (gSeriesCounts[link.genre_id] || 0) + 1;
    });

    renderGenreList();
  } catch(err){
    console.error('Narrava: failed to load genres', err);
    showToast('Could not load genres — please try again');
  }
})();
