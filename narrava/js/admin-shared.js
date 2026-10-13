// Shared by every admin page except login: sidebar, admin guard, data loading,
// genre chips, Bunny upload and cover image upload

const ADMIN_ICONS = {
  brand: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 4h3v16H4V4zm5 6h3v10H9V10zm5-4h3v14h-3V6z" fill="currentColor"/></svg>',
  dashboard: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="13" y="13" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.8"/></svg>',
  content: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M3 9h18" stroke="currentColor" stroke-width="1.8"/></svg>',
  users: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.4" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 20c1.4-4 4.2-6 7.5-6s6.1 2 7.5 6" stroke="currentColor" stroke-width="1.8"/></svg>',
  revenue: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 20V10M12 20V4M20 20v-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  analytics: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 17l5-6 4 3 6-8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 20h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  eye: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="1.8"/></svg>',
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
  { page: 'analytics', label: 'Analytics', href: 'analytics.html', icon: ADMIN_ICONS.analytics },
  { page: 'most-watched', label: 'Most Watched', href: 'most-watched.html', icon: ADMIN_ICONS.eye },
  { page: 'system-settings', label: 'System Settings', href: 'system-settings.html', icon: ADMIN_ICONS.settings }
];

// Minor units (kobo / cents) to display text, e.g. ₦20,000.50 · $5.00
function formatMinorAmount(minor, currency){
  const n = Number(minor) || 0;
  if(currency === 'USD'){
    return '$' + (n / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if(currency === 'NGN'){
    const whole = n % 100 === 0;
    return '₦' + (n / 100).toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
  }
  return escapeHtml(String(currency || '?')) + ' ' + n.toLocaleString('en-US') + ' (minor units)';
}

// Purchase types counted as revenue (Revenue page and Dashboard)
const REVENUE_PURCHASE_TYPES = ['coin_pack', 'subscription'];

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

  // Group the Content Management links
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

  setupAdminMobileNav(activePage);
}

// ---------- Phone layout ----------
// Below 860px the sidebar is a slide-in drawer
function setupAdminMobileNav(activePage){
  const shell = document.querySelector('.admin-shell');
  const sidebar = document.getElementById('adminSidebar');
  if(!shell || !sidebar || document.getElementById('adminMenuBtn')) return;

  const current = ADMIN_NAV_ITEMS.find(item => item.page === activePage);
  const title = current ? current.label : 'Admin';

  const bar = document.createElement('div');
  bar.className = 'admin-mobilebar';
  bar.innerHTML =
    '<button type="button" class="admin-menu-btn" id="adminMenuBtn" aria-label="Open menu" aria-expanded="false" aria-controls="adminSidebar">' +
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
    '</button>' +
    '<div class="admin-mobilebar-brand">Narrava Admin</div>' +
    '<div class="admin-mobilebar-page">' + escapeHtml(title) + '</div>';
  shell.insertBefore(bar, shell.firstChild);

  const backdrop = document.createElement('div');
  backdrop.className = 'admin-drawer-backdrop';
  backdrop.id = 'adminDrawerBackdrop';
  shell.appendChild(backdrop);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'admin-drawer-close';
  closeBtn.id = 'adminDrawerClose';
  closeBtn.setAttribute('aria-label', 'Close menu');
  closeBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  sidebar.insertBefore(closeBtn, sidebar.firstChild);

  const menuBtn = document.getElementById('adminMenuBtn');

  function setOpen(open){
    shell.classList.toggle('nav-open', open);
    document.body.classList.toggle('admin-nav-locked', open);
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if(open) closeBtn.focus(); else if(document.activeElement && sidebar.contains(document.activeElement)) menuBtn.focus();
  }

  menuBtn.addEventListener('click', () => setOpen(!shell.classList.contains('nav-open')));
  closeBtn.addEventListener('click', () => setOpen(false));
  backdrop.addEventListener('click', () => setOpen(false));
  sidebar.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (e) => { if(e.key === 'Escape' && shell.classList.contains('nav-open')) setOpen(false); });
  window.matchMedia('(min-width: 861px)').addEventListener('change', (e) => { if(e.matches) setOpen(false); });
}

// ---------- Tables on a phone ----------
// Labels each cell from its column header (data-label) for the stacked card layout
function labelAdminTableCells(){
  document.querySelectorAll('table.admin-table').forEach(table => {
    const heads = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
    table.querySelectorAll('tbody tr').forEach(tr => {
      Array.from(tr.children).forEach((td, i) => {
        if(td.colSpan > 1 || td.hasAttribute('data-label') || heads[i] === undefined) return;
        td.setAttribute('data-label', heads[i]);
      });
    });
  });
}
(function watchAdminTables(){
  let queued = false;
  const run = () => { queued = false; labelAdminTableCells(); };
  new MutationObserver(() => { if(!queued){ queued = true; requestAnimationFrame(run); } })
    .observe(document.documentElement, { childList: true, subtree: true });
})();

// Run first on every admin page. Redirects to login.html (never resolves) if not an admin.
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

// Series, genres and their links, fresh each call
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

// Read-only genre pills
function genreTagsHtml(genres, genreIds){
  const names = genres.filter(g => genreIds && genreIds.has(g.id)).map(g => g.name);
  if(!names.length) return '<span class="admin-row-sub">No genres</span>';
  return '<div class="admin-genre-tags">' + names.map(n => '<span class="admin-tag">' + escapeHtml(n) + '</span>').join('') + '</div>';
}

// Editable genre chips (each toggle saves straight away)
function genreChipsEditHtml(seriesId, genres, genreIds){
  if(!genres.length) return '<div class="admin-row-sub">No genres yet. Add one on the Genres page.</div>';
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
        showToast('Couldn’t update the genre. Try again.');
      } finally {
        chip.disabled = false;
      }
    });
  });
}

// Upload: 1. bunny-upload-init  2. tus upload to Bunny  3. save the episode row.
// Throws a display-ready message.
async function uploadEpisodeToBunny({ seriesId, seriesTitle, episodeNumber, title, file }, els){
  const bunnyTitle = title || (seriesTitle ? seriesTitle + ' — Episode ' + episodeNumber : 'Episode ' + episodeNumber);

  els.submitBtn.disabled = true;
  els.submitBtn.textContent = 'Requesting upload…';

  let initResult;
  try {
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if(sessionError) throw sessionError;
    if(!sessionData || !sessionData.session || !sessionData.session.access_token){
      throw new Error('Session ended. Log in again.');
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
      let message = 'Upload permission was refused.';
      try {
        const errBody = await initResponse.json();
        if(errBody && (errBody.error || errBody.message)) message = errBody.error || errBody.message;
      } catch(_parseErr){ /* body wasn't JSON — keep the status-based message */ }
      throw new Error(message);
    }

    initResult = await initResponse.json();
    if(!initResult || !initResult.videoId || !initResult.signature){
      throw new Error('Upload permission reply was incomplete.');
    }
  } catch(err){
    console.error('Narrava: bunny-upload-init failed', err);
    els.submitBtn.disabled = false;
    els.submitBtn.textContent = 'Upload Episode';
    throw new Error('Couldn’t start the upload: ' + (err.message || 'please try again.'));
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
    throw new Error('Upload failed partway: ' + (err && err.message ? err.message : 'please try again.'));
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
    throw new Error('Video uploaded to Bunny (ID ' + initResult.videoId + '), but the episode couldn’t be saved: ' +
      (err.message || 'please try again') + '. Retry, or add it with that video ID.');
  }
}

// Deletes one video on Bunny via bunny-delete-video. Throws on any failure.
async function deleteBunnyVideo(videoId){
  const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
  if(sessionError) throw sessionError;
  if(!sessionData || !sessionData.session || !sessionData.session.access_token){
    throw new Error('Session ended. Log in again.');
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
    throw new Error('Couldn’t reach Bunny. Check your connection.');
  }

  let body = null;
  try { body = await response.json(); } catch(_parseErr){ /* body wasn't JSON */ }

  if(!response.ok || !body || body.success !== true){
    const message = (body && (body.error || body.message)) || ('Bunny couldn’t delete the video.');
    throw new Error(message);
  }

  return body;
}

// Cover image upload to the cover-images bucket; returns the public URL
async function uploadCoverImageFile(file){
  const rawExt = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ext = rawExt || 'jpg';
  const path = (crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random().toString(16).slice(2))) + '.' + ext;

  const { error } = await supabaseClient.storage.from('cover-images').upload(path, file, { cacheControl: '3600', upsert: false });
  if(error) throw error;

  const { data } = supabaseClient.storage.from('cover-images').getPublicUrl(path);
  return data.publicUrl;
}

// Storage path of one of our cover-images URLs, or null for anything else
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
