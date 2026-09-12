// admin-shared.js
//
// Shared across every real admin page (admin/dashboard.html,
// series-list.html, episodes.html, genres.html, revenue-analytics.html,
// user-management.html, system-settings.html) — NOT admin/login.html,
// which has its own small script since it runs before any of this is
// relevant. One shared source for: the sidebar shell (so every page's
// nav is generated from the same markup, never hand-copied seven
// times), the admin-session guard, core series/genre data loading, the
// genre-chip widget, and the exact tested Bunny upload flow (used by
// both dashboard.html's "Upload Episodes" panel and episodes.html's
// upload form — same steps, same permission check, only the DOM it's
// wired to differs).
//
// escapeHtml/showToast come from shared-utils.js.

const ADMIN_ICONS = {
  brand: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 4h3v16H4V4zm5 6h3v10H9V10zm5-4h3v14h-3V6z" fill="currentColor"/></svg>',
  dashboard: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="13" y="13" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.8"/></svg>',
  content: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M3 9h18" stroke="currentColor" stroke-width="1.8"/></svg>',
  users: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.4" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 20c1.4-4 4.2-6 7.5-6s6.1 2 7.5 6" stroke="currentColor" stroke-width="1.8"/></svg>',
  revenue: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 20V10M12 20V4M20 20v-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  settings: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/><path d="M19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 00-2-1.2L14.2 3h-4.4l-.4 2.6a7 7 0 00-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 000 2.4l-2 1.5 2 3.4 2.3-.9c.6.5 1.3.9 2 1.2l.4 2.6h4.4l.4-2.6c.7-.3 1.4-.7 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" stroke="currentColor" stroke-width="1.4"/></svg>',
  chevron: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  search: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>'
};

const ADMIN_NAV_ITEMS = [
  { page: 'dashboard', label: 'Dashboard', href: 'dashboard.html', icon: ADMIN_ICONS.dashboard },
  { heading: 'Content Management' },
  { page: 'series-list', label: 'Series List', href: 'series-list.html', sub: true },
  { page: 'episodes', label: 'Episodes', href: 'episodes.html', sub: true },
  { page: 'genres', label: 'Genres', href: 'genres.html', sub: true },
  { page: 'user-management', label: 'User Management', href: 'user-management.html', icon: ADMIN_ICONS.users },
  { page: 'revenue-analytics', label: 'Revenue & Analytics', href: 'revenue-analytics.html', icon: ADMIN_ICONS.revenue },
  { page: 'system-settings', label: 'System Settings', href: 'system-settings.html', icon: ADMIN_ICONS.settings }
];

function formatNaira(amount){
  return '₦' + Number(amount || 0).toLocaleString('en-NG');
}

function adminInitialsFromEmail(email){
  const local = String(email || '').split('@')[0];
  const parts = local.split(/[._-]+/).filter(Boolean);
  if(parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase() || '?';
}

function renderAdminSidebar(activePage, session){
  const mount = document.getElementById('adminSidebar');
  if(!mount) return;

  const navHtml = ADMIN_NAV_ITEMS.map(item => {
    if(item.heading) return '<div class="admin-nav-heading">' + ADMIN_ICONS.content + item.heading + '</div>';
    if(item.sub){
      return '<a class="admin-nav-sub-item' + (item.page === activePage ? ' active' : '') + '" href="' + item.href + '">' + item.label + '</a>';
    }
    return '<a class="admin-nav-item' + (item.page === activePage ? ' active' : '') + '" href="' + item.href + '">' + item.icon + item.label + '</a>';
  });

  // Group the three sub-items under Content Management inside .admin-nav-sub,
  // same shape the reference design uses (indented links below the heading).
  const grouped = [];
  let subBuffer = [];
  ADMIN_NAV_ITEMS.forEach((item, i) => {
    if(item.sub){ subBuffer.push(navHtml[i]); return; }
    if(subBuffer.length){ grouped.push('<div class="admin-nav-sub">' + subBuffer.join('') + '</div>'); subBuffer = []; }
    grouped.push(navHtml[i]);
  });
  if(subBuffer.length) grouped.push('<div class="admin-nav-sub">' + subBuffer.join('') + '</div>');

  const email = session && session.user ? session.user.email : '';

  mount.innerHTML =
    '<div class="admin-brand"><span class="admin-brand-icon">' + ADMIN_ICONS.brand + '</span>Narrava Admin</div>' +
    '<nav class="admin-nav-group">' + grouped.join('') + '</nav>' +
    '<div class="admin-sidebar-spacer"></div>' +
    '<button type="button" class="admin-sidebar-user" id="adminSidebarSignOut" title="Sign out">' +
      '<div class="admin-avatar">' + escapeHtml(adminInitialsFromEmail(email)) + '</div>' +
      '<div class="admin-who">' +
        '<div class="admin-user-name">' + escapeHtml(email) + '</div>' +
        '<div class="admin-user-status"><span class="admin-status-dot"></span> Admin — sign out</div>' +
      '</div>' +
      '<span class="admin-chev">' + ADMIN_ICONS.chevron + '</span>' +
    '</button>';

  document.getElementById('adminSidebarSignOut').addEventListener('click', async () => {
    try {
      const { error } = await supabaseClient.auth.signOut();
      if(error) throw error;
    } catch(err){
      console.error('Narrava: admin sign out failed', err);
    }
    window.location.href = 'login.html';
  });
}

// Every protected admin page calls this first, before rendering
// anything real. Same admin check used throughout the app
// (profiles.is_admin on the signed-in user's own row) — this only
// decides whether *this page* shows its content; the real boundary is
// the admin-only RLS policies on series/episodes/genres themselves.
// Resolves to the session on success; otherwise redirects to
// login.html and never resolves (the caller's page script simply never
// runs its render step).
async function requireAdminSession(activePage){
  return new Promise((resolve) => {
    (async () => {
      try {
        const { data, error } = await supabaseClient.auth.getSession();
        if(error) throw error;
        const session = data && data.session;
        if(!session){ window.location.href = 'login.html'; return; }

        const { data: profile, error: profileError } = await supabaseClient
          .from('profiles')
          .select('is_admin')
          .eq('id', session.user.id)
          .single();
        if(profileError) throw profileError;

        if(!profile || !profile.is_admin){ window.location.href = 'login.html'; return; }

        renderAdminSidebar(activePage, session);
        resolve(session);
      } catch(err){
        console.error('Narrava: admin session check failed', err);
        window.location.href = 'login.html';
      }
    })();
  });
}

// Series + genres + series_genres links, the core data almost every
// admin page needs in some form. Returns plain objects/arrays, not
// cached globally, so each page fetches its own current copy.
async function loadCoreAdminData(){
  const [seriesResult, genreResult, linkResult] = await Promise.all([
    supabaseClient.from('series').select('id, title, description, cover_image_url, free_episode_count, featured_at, status').order('created_at', { ascending: false }),
    supabaseClient.from('genres').select('id, name').order('name', { ascending: true }),
    supabaseClient.from('series_genres').select('series_id, genre_id')
  ]);
  if(seriesResult.error) throw seriesResult.error;
  if(genreResult.error) throw genreResult.error;
  if(linkResult.error) throw linkResult.error;

  const seriesGenres = {};
  (linkResult.data || []).forEach(link => {
    if(!seriesGenres[link.series_id]) seriesGenres[link.series_id] = new Set();
    seriesGenres[link.series_id].add(link.genre_id);
  });

  return { series: seriesResult.data || [], genres: genreResult.data || [], seriesGenres };
}

// Read-only tag pills for a table cell — genre *assignment* now happens
// in the series edit form (see admin-series-list.js), not inline here,
// so this is display only.
function genreTagsHtml(genres, genreIds){
  const names = genres.filter(g => genreIds && genreIds.has(g.id)).map(g => g.name);
  if(!names.length) return '<span class="admin-row-sub">No genres</span>';
  return '<div class="admin-genre-tags">' + names.map(n => '<span class="admin-tag">' + escapeHtml(n) + '</span>').join('') + '</div>';
}

// Editable genre chips — toggling a chip writes straight to
// series_genres immediately (no separate "save" step, matching how
// this already worked before), used inside the series edit form.
function genreChipsEditHtml(seriesId, genres, genreIds){
  if(!genres.length) return '<div class="admin-row-sub">No genres exist yet — add one on the Genres page.</div>';
  return '<div class="genre-chips">' + genres.map(g =>
    '<button type="button" class="genre-chip' + (genreIds.has(g.id) ? ' active' : '') + '" data-series-id="' + seriesId + '" data-genre-id="' + g.id + '">' + escapeHtml(g.name) + '</button>'
  ).join('') + '</div>';
}

function wireGenreChipsEdit(container, seriesGenres){
  container.querySelectorAll('.genre-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      const seriesId = chip.dataset.seriesId;
      const genreId = chip.dataset.genreId;
      const isActive = chip.classList.contains('active');
      chip.disabled = true;
      try {
        if(isActive){
          const { error } = await supabaseClient.from('series_genres').delete().eq('series_id', seriesId).eq('genre_id', genreId);
          if(error) throw error;
          seriesGenres[seriesId] && seriesGenres[seriesId].delete(genreId);
          chip.classList.remove('active');
        } else {
          const { error } = await supabaseClient.from('series_genres').insert({ series_id: seriesId, genre_id: genreId });
          if(error) throw error;
          if(!seriesGenres[seriesId]) seriesGenres[seriesId] = new Set();
          seriesGenres[seriesId].add(genreId);
          chip.classList.add('active');
        }
      } catch(err){
        console.error('Narrava: failed to update series genre', err);
        showToast('Could not update genre — please try again');
      } finally {
        chip.disabled = false;
      }
    });
  });
}

// The full upload flow, in the exact order it has to happen — unchanged
// from where it was originally built and tested, only factored out so
// both dashboard.html and episodes.html can present it in their own
// layout without duplicating the logic:
//   1. ask bunny-upload-init for permission (stop on any failure — never
//      touch Bunny without it)
//   2. stream the actual file to Bunny over tus, real progress
//   3. only once the upload has genuinely succeeded, save the episode
//      row (bunny_video_id from step 1, duration_seconds left null —
//      there's no reliable way to know it yet)
// `els` = { errorEl, submitBtn, progressWrap, progressFill, progressLabel }.
// Throws on failure (with a message already suited for display); the
// one edge case worth calling out in that message is a step-3 failure,
// where the video is already sitting on Bunny even though saving the
// row failed.
async function uploadEpisodeToBunny({ seriesId, seriesTitle, episodeNumber, title, file }, els){
  const bunnyTitle = title || (seriesTitle ? seriesTitle + ' — Episode ' + episodeNumber : 'Episode ' + episodeNumber);

  els.submitBtn.disabled = true;
  els.submitBtn.textContent = 'Requesting upload…';

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
    els.submitBtn.disabled = false;
    els.submitBtn.textContent = 'Upload Episode';
    throw new Error('Could not start the upload: ' + (err.message || 'please try again.'));
  }

  els.submitBtn.textContent = 'Uploading…';
  if(els.progressWrap){
    els.progressWrap.classList.add('show');
    els.progressFill.style.width = '0%';
    els.progressLabel.textContent = '0%';
  }

  try {
    await new Promise((resolve, reject) => {
      const upload = new tus.Upload(file, {
        endpoint: 'https://video.bunnycdn.com/tusupload',
        retryDelays: [0, 1000, 3000, 5000],
        headers: {
          AuthorizationSignature: initResult.signature,
          AuthorizationExpire: String(initResult.expirationTime),
          VideoId: initResult.videoId,
          LibraryId: String(initResult.libraryId)
        },
        metadata: { filetype: file.type, title: bunnyTitle },
        onError: (uploadError) => reject(uploadError),
        onProgress: (bytesUploaded, bytesTotal) => {
          const pct = bytesTotal ? Math.round((bytesUploaded / bytesTotal) * 100) : 0;
          if(els.progressFill){
            els.progressFill.style.width = pct + '%';
            els.progressLabel.textContent = pct + '%';
          }
        },
        onSuccess: () => resolve()
      });
      upload.start();
    });
  } catch(err){
    console.error('Narrava: Bunny upload failed', err);
    els.submitBtn.disabled = false;
    els.submitBtn.textContent = 'Upload Episode';
    if(els.progressWrap) els.progressWrap.classList.remove('show');
    throw new Error('The upload failed partway through: ' + (err && err.message ? err.message : 'please try again.'));
  }

  els.submitBtn.textContent = 'Saving…';

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
      .select('id, series_id, episode_number, title, bunny_video_id, duration_seconds, created_at')
      .single();
    if(epError) throw epError;
    return epData;
  } catch(err){
    console.error('Narrava: failed to save episode row after a successful Bunny upload', err);
    els.submitBtn.disabled = false;
    els.submitBtn.textContent = 'Upload Episode';
    if(els.progressWrap) els.progressWrap.classList.remove('show');
    throw new Error('The video uploaded to Bunny successfully (video ID: ' + initResult.videoId + '), but saving the episode record failed: ' +
      (err.message || 'please try again') + '. The video isn’t lost — retry saving, or add it manually using that video ID.');
  }
}

// Calls the already-deployed bunny-delete-video Edge Function to remove
// one real video asset from Bunny — the real counterpart to
// uploadEpisodeToBunny above, used by an episode's delete action so
// deleting the record also stops it costing Bunny storage, instead of
// just forgetting about an orphaned video. Confirmed live against the
// real function: it expects {videoId}, returns {success:true} on a
// genuine success and {error:"..."} with a non-2xx status on failure —
// same envelope shape bunny-upload-init already uses, so this mirrors
// that same error-message handling. Throws on any failure (missing/bad
// session, non-2xx response, success:false, or a network error) — the
// caller decides what "don't silently pretend it worked" looks like on
// its end (see handleDelete in admin-episodes.js: the database row is
// never deleted unless this resolves).
async function deleteBunnyVideo(videoId){
  const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
  if(sessionError) throw sessionError;
  if(!sessionData || !sessionData.session || !sessionData.session.access_token){
    throw new Error('No active session — please log in again.');
  }

  let response;
  try {
    response = await fetch(SUPABASE_URL + '/functions/v1/bunny-delete-video', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + sessionData.session.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ videoId })
    });
  } catch(networkErr){
    throw new Error('Could not reach Bunny to delete the video — check your connection and try again.');
  }

  let body = null;
  try { body = await response.json(); } catch(_parseErr){ /* body wasn't JSON */ }

  if(!response.ok || !body || body.success !== true){
    const message = (body && (body.error || body.message)) || ('Bunny video deletion failed (status ' + response.status + ').');
    throw new Error(message);
  }

  return body;
}

// Cover image uploads (Create Series + Series List edit forms) — real
// files going to the existing `cover-images` Supabase Storage bucket
// (admin-only write access already configured there), replacing the old
// plain URL text field. Much simpler than the Bunny video flow above:
// one direct upload, then the bucket's own public URL is the real
// cover_image_url, same field a pasted URL used to fill.
async function uploadCoverImageFile(file){
  const rawExt = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ext = rawExt || 'jpg';
  const path = (crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random().toString(16).slice(2))) + '.' + ext;

  const { error } = await supabaseClient.storage.from('cover-images').upload(path, file, { cacheControl: '3600', upsert: false });
  if(error) throw error;

  const { data } = supabaseClient.storage.from('cover-images').getPublicUrl(path);
  return data.publicUrl;
}

// Pulls the storage path back out of one of our own cover-images public
// URLs, so a replaced cover can actually be deleted afterward (this
// bucket supports real cleanup, unlike Bunny video assets). Returns null
// for anything that isn't a URL this bucket actually issued — e.g. a
// pasted external URL saved before this feature existed — since there's
// nothing of ours to delete there.
function coverImageStoragePath(url){
  if(!url) return null;
  const marker = '/object/public/cover-images/';
  const idx = url.indexOf(marker);
  if(idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}

async function deleteCoverImageIfOwned(url){
  const path = coverImageStoragePath(url);
  if(!path) return;
  const { error } = await supabaseClient.storage.from('cover-images').remove([path]);
  if(error) console.error('Narrava: failed to delete replaced cover image', error);
}
