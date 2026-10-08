// downloads.js
//
// Offline downloads for subscribers: the Download button in the episode
// actions (mobile feed rail and desktop Watch page), the Downloads screen
// (Profile -> Download), and the local copies the players use instead of
// streaming (video-player.js's attachEpisodePlayback asks
// localPlaybackUrl first).
//
// Who may download is decided by the server alone. Starting a download
// asks bunny-signed-playback-url for a link with purpose 'download'; it
// only answers active subscribers (and admins), with a link that lasts
// 30 minutes, and otherwise says 403 "Downloads are for subscribers". The
// button is only drawn for active subscribers (hasActiveSubscription,
// coins.js), but that is presentation only: the server's answer is final.
// Episodes already downloaded stay playable after a subscription ends;
// only NEW downloads need one.
//
// How a download is fetched — exactly the way the streaming player does
// (see video-player.js): the signed master playlist URL carries Bunny's
// token in its query string; the master lists one sub-playlist per
// rendition by relative path, and each sub-playlist lists its segments
// by relative path. Relative resolution drops the query string, so the
// same token query is put back on every request (bunnyAuthorizedUrl, the
// helper hls.js's xhrSetup uses too). One rendition is kept: the one
// whose short side is 720 (720p), else the highest below it, else the
// lowest above it.
//
// Where it's kept — only inside the app, never as a file on the phone:
//   - Cache Storage, cache DOWNLOADS_CACHE ('narrava-offline-v1'), under
//     app-local URLs offline/<episodeId>/…: master.m3u8 (one rendition),
//     video.m3u8 (the rendition, rewritten to local names), seg-NNNNN.ts
//     (+ key-N / init-N files if a playlist ever references them) and
//     cover. sw.js serves offline/… from this cache only, never the
//     network, and its version clean-up never deletes this cache.
//   - IndexedDB 'narrava-downloads', store 'episodes': one record per
//     finished episode (ids, titles, numbers, size, date, duration).
//     Written LAST, after every file is in the cache, so a half-download
//     can never be listed as complete. No signed URL or token is ever
//     stored in either place; the saved playlists are checked for that
//     before the record is written.
//
// One download at a time; others queue. A failure (or a refusal) deletes
// that episode's partial files and shows the honest reason. Files left
// by a download that was interrupted (tab closed mid-way) have no record,
// and are deleted the next time the app starts.

const DOWNLOADS_CACHE = 'narrava-offline-v1'; // same name in sw.js
const DOWNLOADS_DB_NAME = 'narrava-downloads';
const DOWNLOADS_STORE = 'episodes';
const DOWNLOAD_TARGET_SHORT_SIDE = 720;
const DOWNLOAD_PARALLEL_FILES = 3;
const DOWNLOAD_NETWORK_RETRIES = 2;
const DOWNLOAD_SPACE_MARGIN_BYTES = 20 * 1024 * 1024;
const DOWNLOAD_LINK_TIMEOUT_MS = 20000;
const DOWNLOAD_FILE_TIMEOUT_MS = 45000; // one segment, playlist or cover, body included

const downloadedRecords = new Map(); // episodeId -> IndexedDB record (finished downloads only)
const downloadJobs = new Map();      // episodeId -> { info, status: 'queued'|'downloading'|'failed', percent, error }
const downloadQueue = [];            // episodeIds waiting their turn
let activeDownloadId = null;

class DownloadError extends Error {}

// ---------- local URLs ----------

// offline/<episodeId>/ next to index.html (inside the service worker's scope).
function offlineBaseUrl(episodeId){
  return new URL('offline/' + encodeURIComponent(episodeId) + '/', document.baseURI).href;
}
function offlineCoverUrl(record){
  return record && record.hasCover ? offlineBaseUrl(record.episodeId) + 'cover' : '';
}

// ---------- IndexedDB ----------

let downloadsDbPromise = null;
function openDownloadsDb(){
  if(!downloadsDbPromise){
    downloadsDbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DOWNLOADS_DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(DOWNLOADS_STORE, { keyPath: 'episodeId' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    downloadsDbPromise.catch(() => { downloadsDbPromise = null; });
  }
  return downloadsDbPromise;
}

// Runs one request in its own transaction; resolves once it's committed.
function downloadsDbRun(mode, makeRequest){
  return openDownloadsDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(DOWNLOADS_STORE, mode);
    const req = makeRequest(tx.objectStore(DOWNLOADS_STORE));
    let result;
    req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

// ---------- startup ----------

// Resolved once the finished downloads are known. attachEpisodePlayback
// and the offline start (offline.js) wait on it.
const downloadsReady = loadDownloadRecords();

async function loadDownloadRecords(){
  try {
    const rows = await downloadsDbRun('readonly', store => store.getAll());
    downloadedRecords.clear();
    (rows || []).forEach(r => downloadedRecords.set(r.episodeId, r));
    await reconcileDownloadFiles();
  } catch(err){
    console.error('Narrava: failed to read downloads', err);
  }
  // IndexedDB can answer before the scripts after this one have run;
  // the listeners (buttons, screens) need app.js and friends loaded.
  if(document.readyState === 'loading'){
    await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  }
  notifyDownloadsChanged();
}

// Deletes files with no finished record (an interrupted download), and
// records whose playlist is gone (the browser cleared the cache but not
// IndexedDB) — so the list only ever shows what can really play.
async function reconcileDownloadFiles(){
  if(!('caches' in window)) return;
  const cache = await caches.open(DOWNLOADS_CACHE);
  const keys = await cache.keys();
  const root = new URL('offline/', document.baseURI).href;
  const withFiles = new Set();
  await Promise.all(keys.map(req => {
    if(!req.url.startsWith(root)) return null;
    const episodeId = decodeURIComponent(req.url.slice(root.length).split('/')[0]);
    withFiles.add(episodeId);
    if(downloadedRecords.has(episodeId) || downloadJobs.has(episodeId)) return null;
    return cache.delete(req);
  }));
  for(const [episodeId] of downloadedRecords){
    const playlist = withFiles.has(episodeId) && await cache.match(offlineBaseUrl(episodeId) + 'master.m3u8');
    if(!playlist){
      console.warn('Narrava: a downloaded episode’s files are gone; removing it from Downloads', episodeId);
      await removeDownload(episodeId, { quiet: true });
    }
  }
}

function notifyDownloadsChanged(){
  document.dispatchEvent(new CustomEvent('narrava:downloads-changed'));
}

// ---------- what the players use ----------

function isEpisodeDownloaded(episodeId){
  return downloadedRecords.has(episodeId);
}

// The local master playlist for a downloaded episode, or null (not
// downloaded, files missing, or no service worker controlling this page
// yet — only the service worker can answer offline/… URLs).
async function localPlaybackUrl(episodeId){
  await downloadsReady;
  if(!downloadedRecords.has(episodeId)) return null;
  if(!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return null;
  const url = offlineBaseUrl(episodeId) + 'master.m3u8';
  try {
    const cache = await caches.open(DOWNLOADS_CACHE);
    if(!(await cache.match(url))) return null;
  } catch(_err){
    return null;
  }
  return url;
}

// Episode rows (the same shape fetchEpisodesForSeries returns) for the
// downloaded episodes of one series — used when the server can't be
// reached (feed-data.js) and for series built from downloads offline.
function downloadedEpisodeRows(seriesId){
  return [...downloadedRecords.values()]
    .filter(r => r.seriesId === seriesId)
    .sort((a, b) => a.episodeNumber - b.episodeNumber)
    .map(r => ({
      id: r.episodeId,
      series_id: r.seriesId,
      episode_number: r.episodeNumber,
      title: r.episodeTitle || null,
      bunny_video_id: r.bunnyVideoId || 'downloaded',
      duration_seconds: r.durationSeconds || null
    }));
}

// A feed slide (same shape as fetchSlides' slides) for a series known
// only from its downloads: offline, or a series no longer published.
function buildDownloadedSeriesSlide(seriesId){
  const episodes = downloadedEpisodeRows(seriesId);
  if(!episodes.length) return null;
  const first = [...downloadedRecords.values()].find(r => r.seriesId === seriesId && r.episodeId === episodes[0].id);
  const coverRecord = [...downloadedRecords.values()].find(r => r.seriesId === seriesId && r.hasCover);
  const slide = {
    id: seriesId,
    createdAt: null,
    featuredAt: null,
    bunnyVideoId: null,
    episodeId: null,
    title: first.seriesTitle || 'Downloaded series',
    synopsis: '',
    epBadge: '',
    currentEp: episodes[0].episode_number,
    totalEp: first.seriesEpisodeCount || episodes.length,
    episodes,
    episodesLoaded: true,
    activeEpisode: null,
    locked: false,
    lockedEpisode: null,
    likes: 0, saved: false, liked: false, commentCount: 0, saves: 0, shares: 0,
    socialLoaded: true, // nothing to fetch for it offline
    freeEpisodeCount: first.freeEpisodeCount || 0,
    art: coverRecord
      ? { type: 'img', src: offlineCoverUrl(coverRecord) }
      : { type: 'markup', markup: '<div class="downloaded-art-blank"></div>' }
  };
  setActiveEpisode(slide, episodes[0]); // app.js — downloaded episodes count as unlocked (coins.js)
  return slide;
}

// Plays a downloaded episode in the normal player: the mobile feed or the
// desktop Watch page (openSeriesInFeed), at the saved position if
// there is one. attachEpisodePlayback then picks the local copy.
async function playDownloadedEpisode(episodeId){
  const record = downloadedRecords.get(episodeId);
  if(!record) return;
  await slidesReady; // app.js
  let i = slides.findIndex(s => s.id === record.seriesId);
  const slide = i === -1 ? null : slides[i];
  if(slide && slide.episodesLoaded && !slide.episodes.some(e => e.id === episodeId)){
    // This session's episode list for the series doesn't have it (the
    // list came from the server while it couldn't be reached): add it.
    slide.episodes = slide.episodes.concat(downloadedEpisodeRows(record.seriesId).filter(e => e.id === episodeId))
      .sort((a, b) => a.episode_number - b.episode_number);
  }
  if(i === -1){
    const built = buildDownloadedSeriesSlide(record.seriesId);
    if(!built) return;
    slides.push(built);
    i = slides.length - 1;
  }
  const saved = continueWatchingMap.get(record.seriesId); // app.js — empty offline
  const position = (saved && saved.episode_id === episodeId) ? saved.position_seconds : 0;
  openSeriesInFeed(i, { episode_id: episodeId, position_seconds: position, exactEpisode: true });
}

// ---------- the download itself ----------

async function requestDownloadLink(episodeId){
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const accessToken = sessionData && sessionData.session ? sessionData.session.access_token : null;
  if(!accessToken) throw new DownloadError('Sign in to download episodes.');

  let res;
  try {
    res = await withTimeout(fetch(SUPABASE_URL + '/functions/v1/bunny-signed-playback-url', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ episodeId, purpose: 'download' })
    }), DOWNLOAD_LINK_TIMEOUT_MS);
  } catch(_err){
    throw new DownloadError('No connection to the server. Check your internet and try again.');
  }
  let data = null;
  try { data = await res.json(); } catch(_err){ /* not JSON */ }
  if(res.status === 403){
    throw new DownloadError((data && (data.error || data.message)) || 'Downloads are for subscribers');
  }
  if(!res.ok || !data || !data.playbackUrl){
    throw new DownloadError('The server couldn’t prepare this episode for download (error ' + res.status + ').');
  }
  return { playbackUrl: data.playbackUrl, expiresAt: data.expiresAt };
}

// A fresh link (purpose 'download' again — the server decides again) if
// Bunny starts refusing because the 30-minute link ran out mid-download.
async function refreshDownloadAuth(job){
  const fresh = await requestDownloadLink(job.info.episodeId);
  job.authQuery = new URL(fresh.playbackUrl).search;
}

// GET a whole file, body included, or reject after `ms` — a request that
// stalls part-way (seen live: a download sat at 97% for minutes) is
// aborted instead of hanging the download forever.
async function fetchBodyWithTimeout(url, as, ms, init){
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    if(!res.ok) return { status: res.status, body: null };
    return { status: res.status, body: as === 'text' ? await res.text() : await res.blob() };
  } finally {
    clearTimeout(timer);
  }
}

// GET a Bunny file (as 'text' or 'blob') with the token query on it —
// the same rule hls.js's requests follow (bunnyAuthorizedUrl,
// video-player.js). A network failure or a stall is retried twice; a
// 401/403 (the 30-minute link ran out) gets one fresh link.
async function fetchFromBunny(job, url, as){
  let networkFailures = 0;
  let refreshedAuth = false;
  for(;;){
    let result;
    try {
      result = await fetchBodyWithTimeout(bunnyAuthorizedUrl(url, job.authQuery), as, DOWNLOAD_FILE_TIMEOUT_MS, { cache: 'no-store' });
    } catch(_err){
      if(networkFailures >= DOWNLOAD_NETWORK_RETRIES){
        throw new DownloadError('The connection dropped while downloading. Check your internet and try again.');
      }
      networkFailures++;
      await new Promise(r => setTimeout(r, 1000 * networkFailures));
      continue;
    }
    if(result.body !== null) return result.body;
    if((result.status === 401 || result.status === 403) && !refreshedAuth){
      refreshedAuth = true;
      await refreshDownloadAuth(job);
      continue;
    }
    throw new DownloadError('The video server refused part of this episode (error ' + result.status + ').');
  }
}

// #EXT-X-STREAM-INF entries of a master playlist.
function parseMasterPlaylist(text){
  const lines = text.split(/\r?\n/).map(l => l.trim());
  const variants = [];
  lines.forEach((line, i) => {
    if(!line.startsWith('#EXT-X-STREAM-INF:')) return;
    let j = i + 1;
    while(j < lines.length && (!lines[j] || lines[j].startsWith('#'))) j++;
    if(j >= lines.length) return;
    const attrs = line.slice('#EXT-X-STREAM-INF:'.length);
    const res = /RESOLUTION=(\d+)x(\d+)/.exec(attrs);
    const bw = /(?:^|,)BANDWIDTH=(\d+)/.exec(attrs);
    const avg = /AVERAGE-BANDWIDTH=(\d+)/.exec(attrs);
    variants.push({
      infLine: line,
      uri: lines[j],
      width: res ? Number(res[1]) : 0,
      height: res ? Number(res[2]) : 0,
      bandwidth: bw ? Number(bw[1]) : 0,
      averageBandwidth: avg ? Number(avg[1]) : 0,
      audioGroup: (/AUDIO="([^"]+)"/.exec(attrs) || [])[1] || null
    });
  });
  return variants;
}

// 720p (short side 720 — Narrava's videos are portrait, 720x1280), else
// the highest below it, else the lowest above it.
function pickDownloadRendition(variants){
  const sized = variants.filter(v => v.width && v.height);
  if(!sized.length) return variants.slice().sort((a, b) => b.bandwidth - a.bandwidth)[0] || null;
  const side = v => Math.min(v.width, v.height);
  const atOrBelow = sized.filter(v => side(v) <= DOWNLOAD_TARGET_SHORT_SIDE).sort((a, b) => side(b) - side(a) || b.bandwidth - a.bandwidth);
  if(atOrBelow.length) return atOrBelow[0];
  return sized.sort((a, b) => side(a) - side(b) || a.bandwidth - b.bandwidth)[0];
}

// Every file a media playlist references (segments, plus any key or init
// file), each with the local name it will be saved under.
function parseMediaPlaylist(text){
  const lines = text.split(/\r?\n/);
  const files = new Map(); // remote uri -> local name
  let duration = 0;
  let segmentCount = 0, keyCount = 0, mapCount = 0;
  const extOf = (uri, fallback) => {
    const m = /\.([a-z0-9]{1,5})$/i.exec(uri.split('?')[0]);
    return m ? '.' + m[1].toLowerCase() : fallback;
  };
  lines.forEach(raw => {
    const line = raw.trim();
    if(!line) return;
    if(line.startsWith('#EXTINF:')){ duration += parseFloat(line.slice(8)) || 0; return; }
    if(line.startsWith('#EXT-X-KEY') || line.startsWith('#EXT-X-MAP')){
      const m = /URI="([^"]+)"/.exec(line);
      if(m && !files.has(m[1])){
        files.set(m[1], line.startsWith('#EXT-X-KEY') ? 'key-' + (keyCount++) + extOf(m[1], '.key') : 'init-' + (mapCount++) + extOf(m[1], '.mp4'));
      }
      return;
    }
    if(line.startsWith('#')) return;
    if(!files.has(line)) files.set(line, 'seg-' + String(segmentCount++).padStart(5, '0') + extOf(line, '.ts'));
  });
  return { lines, files, duration, segmentCount };
}

// The playlist with every reference swapped for its local name (relative,
// so it resolves to offline/<episodeId>/… — never Bunny, never a token).
function rewriteMediaPlaylist(parsed){
  return parsed.lines.map(raw => {
    const line = raw.trim();
    if(line.startsWith('#EXT-X-KEY') || line.startsWith('#EXT-X-MAP')){
      return line.replace(/URI="([^"]+)"/, (_m, uri) => 'URI="' + parsed.files.get(uri) + '"');
    }
    if(line && !line.startsWith('#')) return parsed.files.get(line);
    return line;
  }).join('\n');
}

function downloadContentType(name){
  if(name.endsWith('.ts')) return 'video/mp2t';
  if(name.endsWith('.m4s') || name.endsWith('.mp4')) return 'video/mp4';
  if(name.endsWith('.aac')) return 'audio/aac';
  if(name.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';
  return 'application/octet-stream';
}

function formatBytes(bytes){
  const n = Number(bytes) || 0;
  if(n === 0) return '0 MB';
  if(n >= 1024 * 1024 * 1024) return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  if(n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
  return Math.max(1, Math.round(n / 1024)) + ' KB';
}

// Asked before the first download so the browser is less likely to clear
// downloads to make room (a request, not a guarantee — see
// DOCUMENTATION.md; Safari may still clear storage of an unused app).
async function requestPersistentStorage(){
  try {
    if(navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())){
      await navigator.storage.persist();
    }
  } catch(err){
    console.warn('Narrava: persistent storage request failed', err);
  }
}

async function checkDownloadSpace(estimatedBytes){
  if(!estimatedBytes || !navigator.storage || !navigator.storage.estimate) return;
  let estimate;
  try { estimate = await navigator.storage.estimate(); } catch(_err){ return; }
  if(!estimate || !estimate.quota) return;
  const free = estimate.quota - (estimate.usage || 0);
  const needed = Math.ceil(estimatedBytes * 1.1) + DOWNLOAD_SPACE_MARGIN_BYTES;
  if(free < needed){
    throw new DownloadError('Not enough space on this device for this episode (it needs about ' + formatBytes(estimatedBytes) +
      ', and only ' + formatBytes(Math.max(0, free)) + ' is free for Narrava). Delete some downloads or free up space, then try again.');
  }
}

async function deleteDownloadFiles(episodeId){
  if(!('caches' in window)) return;
  const cache = await caches.open(DOWNLOADS_CACHE);
  const prefix = offlineBaseUrl(episodeId);
  const keys = await cache.keys();
  await Promise.all(keys.filter(req => req.url.startsWith(prefix)).map(req => cache.delete(req)));
}

async function runDownload(job){
  const info = job.info;
  const base = offlineBaseUrl(info.episodeId);
  try {
    if(!('caches' in window) || !window.indexedDB) throw new DownloadError('This browser can’t keep downloads.');
    const cache = await caches.open(DOWNLOADS_CACHE);
    await deleteDownloadFiles(info.episodeId); // leftovers from an earlier failed attempt
    await requestPersistentStorage();

    const signed = await requestDownloadLink(info.episodeId);
    job.authQuery = new URL(signed.playbackUrl).search;

    const masterText = await fetchFromBunny(job, signed.playbackUrl, 'text');
    const variants = parseMasterPlaylist(masterText);
    let rendition = null;
    let mediaUrl = signed.playbackUrl;
    if(variants.length){
      rendition = pickDownloadRendition(variants);
      if(rendition.audioGroup && /#EXT-X-MEDIA:[^\n]*URI=/.test(masterText)){
        throw new DownloadError('This episode’s video format can’t be downloaded yet.');
      }
      mediaUrl = new URL(rendition.uri, signed.playbackUrl).href;
    }
    const mediaText = variants.length ? await fetchFromBunny(job, mediaUrl, 'text') : masterText;
    const media = parseMediaPlaylist(mediaText);
    if(!media.segmentCount) throw new DownloadError('This episode has no video to download.');

    const bitsPerSecond = rendition ? (rendition.averageBandwidth || rendition.bandwidth) : 0;
    await checkDownloadSpace(bitsPerSecond ? (bitsPerSecond / 8) * media.duration : 0);

    // The files, a few at a time, each straight into the cache.
    const entries = [...media.files.entries()];
    const totalSteps = entries.length + 1; // + the cover
    let doneSteps = 0;
    let sizeBytes = 0;
    const step = () => {
      doneSteps++;
      const percent = Math.min(99, Math.floor((doneSteps / totalSteps) * 100));
      if(percent !== job.percent){ job.percent = percent; notifyDownloadsChanged(); }
    };
    let next = 0;
    const worker = async () => {
      while(next < entries.length){
        const [remote, local] = entries[next++];
        const blob = await fetchFromBunny(job, new URL(remote, mediaUrl).href, 'blob');
        sizeBytes += blob.size;
        await cache.put(base + local, new Response(blob, { headers: { 'Content-Type': downloadContentType(local) } }));
        step();
      }
    };
    await Promise.all(Array.from({ length: DOWNLOAD_PARALLEL_FILES }, worker));

    // The cover, so Downloads shows it offline. Optional: a cover that
    // can't be fetched just shows a plain tile.
    let hasCover = false;
    if(info.coverImageUrl){
      try {
        const cover = await fetchBodyWithTimeout(info.coverImageUrl, 'blob', DOWNLOAD_FILE_TIMEOUT_MS, { mode: 'cors', cache: 'no-store' });
        if(cover.body){
          const blob = cover.body;
          sizeBytes += blob.size;
          await cache.put(base + 'cover', new Response(blob, { headers: { 'Content-Type': blob.type || 'image/jpeg' } }));
          hasCover = true;
        }
      } catch(err){
        console.warn('Narrava: couldn’t save the cover for a download', err);
      }
    }
    step();

    // The rewritten playlists: one rendition, every reference local.
    const localMedia = rewriteMediaPlaylist(media);
    const localMaster = rendition ? '#EXTM3U\n' + rendition.infLine + '\nvideo.m3u8\n' : null;
    const saved = localMedia + (localMaster || '');
    if(/token=|expires=|b-cdn\.net|:\/\//i.test(saved)){
      throw new DownloadError('This episode couldn’t be saved safely.');
    }
    const playlistType = { 'Content-Type': 'application/vnd.apple.mpegurl' };
    await cache.put(base + 'video.m3u8', new Response(localMedia, { headers: playlistType }));
    await cache.put(base + 'master.m3u8', new Response(localMaster || localMedia, { headers: playlistType }));
    sizeBytes += localMedia.length + (localMaster ? localMaster.length : 0);

    // Last: the record that makes it a finished download.
    const record = {
      episodeId: info.episodeId,
      seriesId: info.seriesId,
      seriesTitle: info.seriesTitle,
      seriesEpisodeCount: info.seriesEpisodeCount || null,
      freeEpisodeCount: info.freeEpisodeCount || 0,
      episodeNumber: info.episodeNumber,
      episodeTitle: info.episodeTitle || null,
      bunnyVideoId: info.bunnyVideoId || null,
      durationSeconds: info.durationSeconds || (media.duration ? Math.round(media.duration) : null),
      sizeBytes,
      rendition: rendition && rendition.width ? rendition.width + 'x' + rendition.height : null,
      hasCover,
      downloadedAt: new Date().toISOString()
    };
    await downloadsDbRun('readwrite', store => store.put(record));
    downloadedRecords.set(record.episodeId, record);
  } catch(err){
    try { await deleteDownloadFiles(info.episodeId); } catch(cleanupErr){ console.error('Narrava: failed to clean up a failed download', cleanupErr); }
    throw err;
  }
}

// ---------- queue ----------

// info: { episodeId, seriesId, seriesTitle, seriesEpisodeCount,
// freeEpisodeCount, episodeNumber, episodeTitle, bunnyVideoId,
// durationSeconds, coverImageUrl } — ids and display details only.
function startEpisodeDownload(info){
  if(!info || !info.episodeId || downloadedRecords.has(info.episodeId)) return;
  const existing = downloadJobs.get(info.episodeId);
  if(existing && existing.status !== 'failed') return;
  downloadJobs.set(info.episodeId, { info, status: 'queued', percent: 0, error: null });
  downloadQueue.push(info.episodeId);
  notifyDownloadsChanged();
  if(activeDownloadId) showToast('Added to downloads — it starts after the current one');
  pumpDownloadQueue();
}

async function pumpDownloadQueue(){
  if(activeDownloadId) return;
  const episodeId = downloadQueue.shift();
  if(!episodeId) return;
  const job = downloadJobs.get(episodeId);
  if(!job){ pumpDownloadQueue(); return; }
  activeDownloadId = episodeId;
  job.status = 'downloading';
  job.percent = 0;
  notifyDownloadsChanged();
  try {
    await runDownload(job);
    downloadJobs.delete(episodeId);
    showToast('Episode ' + job.info.episodeNumber + ' downloaded');
  } catch(err){
    console.error('Narrava: download failed', err);
    job.status = 'failed';
    job.error = (err instanceof DownloadError) ? err.message : 'Something went wrong while saving the episode. Please try again.';
    showToast('Download failed: ' + job.error);
  }
  activeDownloadId = null;
  notifyDownloadsChanged();
  pumpDownloadQueue();
}

async function removeDownload(episodeId, opts){
  try {
    await downloadsDbRun('readwrite', store => store.delete(episodeId));
  } catch(err){
    console.error('Narrava: failed to delete a download record', err);
  }
  downloadedRecords.delete(episodeId);
  try { await deleteDownloadFiles(episodeId); } catch(err){ console.error('Narrava: failed to delete download files', err); }
  if(!(opts && opts.quiet)) notifyDownloadsChanged();
}

// Finished downloads only — one still in progress carries on.
async function removeAllDownloads(){
  for(const episodeId of [...downloadedRecords.keys()]) await removeDownload(episodeId, { quiet: true });
  [...downloadJobs.entries()].forEach(([id, job]) => { if(job.status === 'failed') downloadJobs.delete(id); });
  notifyDownloadsChanged();
}

function downloadsTotalBytes(){
  let total = 0;
  downloadedRecords.forEach(r => { total += Number(r.sizeBytes) || 0; });
  return total;
}

// ---------- the Download buttons (feed rail + Watch page) ----------

const DOWNLOAD_ICONS = {
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m-5-5l5 5 5-5M4 20h16"/></svg>',
  downloading: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m-5-5l5 5 5-5"/><path d="M4 20h16" stroke-dasharray="3 3"/></svg>',
  downloaded: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/></svg>',
  failed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 11-2.3-5.7M20 4v5h-5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  offline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8.5a15 15 0 0120 0M5 12a10 10 0 0114 0M8.5 15.5a5 5 0 017 0M12 19h.01M3 3l18 18"/></svg>'
};

// 'none' | 'queued' | 'downloading' | 'downloaded' | 'failed'
function downloadStateFor(episodeId){
  if(downloadedRecords.has(episodeId)) return { state: 'downloaded' };
  const job = downloadJobs.get(episodeId);
  if(job) return { state: job.status, percent: job.percent, error: job.error };
  return { state: 'none' };
}

function downloadInfoFor(slide, ep){
  return {
    episodeId: ep.id,
    seriesId: slide.id,
    seriesTitle: slide.title,
    seriesEpisodeCount: slide.totalEp || null,
    freeEpisodeCount: slide.freeEpisodeCount || 0,
    episodeNumber: ep.episode_number,
    episodeTitle: ep.title || null,
    bunnyVideoId: ep.bunny_video_id || null,
    durationSeconds: ep.duration_seconds || null,
    coverImageUrl: posterArtSrc(slide) || null // discover.js
  };
}

// The episode each button is for right now, or null: the feed's current
// episode, and the Watch page's playing episode.
function feedDownloadTarget(){
  const s = slides[idx];
  if(!s || s.locked || !s.activeEpisode || !s.activeEpisode.bunny_video_id) return null;
  return downloadInfoFor(s, s.activeEpisode);
}
function watchDownloadTarget(){
  if(!watchSlide || !watchActiveEpisodeId) return null;
  const ep = watchEpisodes.find(e => e.id === watchActiveEpisodeId);
  if(!ep || !ep.bunny_video_id) return null;
  return downloadInfoFor(watchSlide, ep);
}

function paintDownloadButton(btn, target){
  if(!btn) return;
  // Only active subscribers see it (the server still decides). A former
  // subscriber's existing downloads stay in the Downloads screen.
  if(!target || !hasActiveSubscription()){ btn.hidden = true; return; }
  btn.hidden = false;
  const st = downloadStateFor(target.episodeId);
  const labels = {
    none: 'Download',
    queued: 'Queued',
    downloading: (st.percent || 0) + '%',
    downloaded: 'Downloaded',
    failed: 'Retry'
  };
  const icon = st.state === 'downloaded' ? DOWNLOAD_ICONS.downloaded
    : st.state === 'failed' ? DOWNLOAD_ICONS.failed
    : (st.state === 'downloading' || st.state === 'queued') ? DOWNLOAD_ICONS.downloading
    : DOWNLOAD_ICONS.download;
  btn.dataset.state = st.state;
  btn.innerHTML = icon + '<span>' + labels[st.state] + '</span>';
  btn.setAttribute('aria-label', st.state === 'failed' ? 'Download failed — tap to retry' : labels[st.state]);
}

function refreshDownloadButtons(){
  paintDownloadButton(document.getElementById('downloadBtn'), feedDownloadTarget());
  paintDownloadButton(document.getElementById('watchDownloadBtn'), watchDownloadTarget());
}

function onDownloadButtonTap(target){
  if(!target) return;
  if(!hasActiveSubscription()){ openMembershipScreen('downloads'); return; }
  const st = downloadStateFor(target.episodeId);
  if(st.state === 'downloaded'){ openDownloadsScreen(); return; }
  if(st.state === 'downloading'){ showToast('Downloading… ' + (st.percent || 0) + '%'); return; }
  if(st.state === 'queued'){ showToast('Waiting for the current download to finish'); return; }
  startEpisodeDownload(target); // 'none' or 'failed' (retry)
}

document.getElementById('downloadBtn').addEventListener('click', () => onDownloadButtonTap(feedDownloadTarget()));
document.getElementById('watchDownloadBtn').addEventListener('click', () => onDownloadButtonTap(watchDownloadTarget()));
document.addEventListener('narrava:downloads-changed', refreshDownloadButtons);
document.addEventListener('narrava:coins-changed', refreshDownloadButtons);

// ---------- the Downloads screen ----------

const downloadsBody = document.getElementById('downloadsBody');
const downloadsBackBtn = document.getElementById('downloadsBackBtn');

function openDownloadsScreen(){
  showScreen('downloads');
  renderDownloadsScreen();
}

// Profile's Download row and tile: Downloads for subscribers (and for
// anyone who already has downloads, or is offline and can't be checked);
// Membership, with a line saying why, for everyone else.
function openDownloadsFromProfile(){
  if(hasActiveSubscription() || downloadedRecords.size || downloadJobs.size || appIsOffline()){
    openDownloadsScreen();
    return;
  }
  openMembershipScreen('downloads');
}

function downloadsScreenVisible(){
  return !document.getElementById('downloadsScreen').classList.contains('screen-hidden');
}

function downloadRowHtml(record){
  const cover = offlineCoverUrl(record);
  return '<div class="download-row">' +
    '<button type="button" class="download-play" data-play-id="' + escapeHtml(record.episodeId) + '" aria-label="Play ' + escapeHtml(record.seriesTitle) + ' episode ' + record.episodeNumber + '">' +
      '<div class="history-cover">' + (cover ? '<img src="' + escapeHtml(cover) + '" alt="">' : '') + '</div>' +
      '<div class="history-info">' +
        '<div class="history-title">' + escapeHtml(record.seriesTitle) + '</div>' +
        '<div class="history-ep">Episode ' + escapeHtml(record.episodeNumber) + '</div>' +
        '<div class="download-meta">' + formatBytes(record.sizeBytes) + ' · ' + escapeHtml(formatShortDate(record.downloadedAt)) + '</div>' +
      '</div>' +
    '</button>' +
    '<button type="button" class="download-delete" data-delete-id="' + escapeHtml(record.episodeId) + '" aria-label="Delete download">' + DOWNLOAD_ICONS.trash + '</button>' +
  '</div>';
}

function downloadJobRowHtml(episodeId, job){
  const label = job.status === 'downloading' ? 'Downloading… ' + (job.percent || 0) + '%'
    : job.status === 'queued' ? 'Waiting…'
    : 'Failed: ' + escapeHtml(job.error || '');
  return '<div class="download-row download-job ' + job.status + '">' +
    '<div class="download-play">' +
      '<div class="history-cover">' + (job.info.coverImageUrl ? '<img src="' + escapeHtml(job.info.coverImageUrl) + '" alt="">' : '') + '</div>' +
      '<div class="history-info">' +
        '<div class="history-title">' + escapeHtml(job.info.seriesTitle) + '</div>' +
        '<div class="history-ep">Episode ' + escapeHtml(job.info.episodeNumber) + '</div>' +
        '<div class="download-meta">' + label + '</div>' +
        (job.status === 'downloading' ? '<div class="download-progress"><span style="width:' + (job.percent || 0) + '%"></span></div>' : '') +
      '</div>' +
    '</div>' +
    (job.status === 'failed'
      ? '<div class="download-job-actions">' +
          '<button type="button" class="help-secondary-btn download-retry" data-retry-id="' + escapeHtml(episodeId) + '">Retry</button>' +
          '<button type="button" class="download-delete" data-dismiss-id="' + escapeHtml(episodeId) + '" aria-label="Remove">' + DOWNLOAD_ICONS.trash + '</button>' +
        '</div>'
      : '') +
  '</div>';
}

function renderDownloadsScreen(){
  const records = [...downloadedRecords.values()];
  const jobs = [...downloadJobs.entries()];
  let html = '<div class="downloads-wrap">';

  if(appIsOffline()){
    html += '<div class="downloads-offline-note">' + DOWNLOAD_ICONS.offline + '<span>You’re offline. Your downloads still play.</span></div>';
  }

  html += '<div class="downloads-summary">' +
      '<div><div class="downloads-summary-label">Storage used</div>' +
      '<div class="downloads-summary-value">' + formatBytes(downloadsTotalBytes()) + '</div>' +
      '<div class="downloads-summary-sub">' + records.length + ' episode' + (records.length === 1 ? '' : 's') + ' · kept inside Narrava on this device</div></div>' +
      (records.length ? '<button type="button" class="help-secondary-btn downloads-delete-all" id="downloadsDeleteAllBtn">Delete all</button>' : '') +
    '</div>';

  if(jobs.length){
    html += '<div class="downloads-group"><div class="downloads-group-title">In progress</div><div class="history-list">' +
      jobs.map(([id, job]) => downloadJobRowHtml(id, job)).join('') + '</div></div>';
  }

  if(!records.length && !jobs.length){
    html += '<div class="discover-empty">No downloads yet.</div>';
  }

  // Grouped by series (alphabetical), episodes in order.
  const bySeries = new Map();
  records.forEach(r => {
    if(!bySeries.has(r.seriesId)) bySeries.set(r.seriesId, []);
    bySeries.get(r.seriesId).push(r);
  });
  [...bySeries.values()]
    .sort((a, b) => String(a[0].seriesTitle).localeCompare(String(b[0].seriesTitle)))
    .forEach(group => {
      group.sort((a, b) => a.episodeNumber - b.episodeNumber);
      html += '<div class="downloads-group"><div class="downloads-group-title">' + escapeHtml(group[0].seriesTitle) + '</div>' +
        '<div class="history-list">' + group.map(downloadRowHtml).join('') + '</div></div>';
    });

  html += '</div>';
  downloadsBody.innerHTML = html;

  downloadsBody.querySelectorAll('[data-play-id]').forEach(el => el.addEventListener('click', () => playDownloadedEpisode(el.dataset.playId)));
  downloadsBody.querySelectorAll('[data-delete-id]').forEach(el => el.addEventListener('click', () => {
    const r = downloadedRecords.get(el.dataset.deleteId);
    if(!r) return;
    openDownloadConfirm('Delete this download?',
      escapeHtml(r.seriesTitle) + ', Episode ' + escapeHtml(r.episodeNumber) + ' (' + formatBytes(r.sizeBytes) + ') will be removed from this device.',
      'Delete', () => removeDownload(r.episodeId));
  }));
  downloadsBody.querySelectorAll('[data-retry-id]').forEach(el => el.addEventListener('click', () => {
    const job = downloadJobs.get(el.dataset.retryId);
    if(job) startEpisodeDownload(job.info);
  }));
  downloadsBody.querySelectorAll('[data-dismiss-id]').forEach(el => el.addEventListener('click', () => {
    downloadJobs.delete(el.dataset.dismissId);
    notifyDownloadsChanged();
  }));
  const deleteAll = document.getElementById('downloadsDeleteAllBtn');
  if(deleteAll) deleteAll.addEventListener('click', () => {
    openDownloadConfirm('Delete all downloads?',
      'All ' + records.length + ' downloaded episode' + (records.length === 1 ? '' : 's') + ' (' + formatBytes(downloadsTotalBytes()) + ') will be removed from this device.',
      'Delete all', removeAllDownloads);
  });
}

document.addEventListener('narrava:downloads-changed', () => {
  if(downloadsScreenVisible()) renderDownloadsScreen();
});
downloadsBackBtn.addEventListener('click', () => navBack());

// ---------- delete confirmation (the app's own modal, not confirm()) ----------

const downloadConfirmBackdrop = document.createElement('div');
downloadConfirmBackdrop.className = 'auth-modal-backdrop';
downloadConfirmBackdrop.id = 'downloadConfirmBackdrop';
downloadConfirmBackdrop.innerHTML = '<div class="auth-modal"><div id="downloadConfirmBody"></div></div>';
document.body.appendChild(downloadConfirmBackdrop);
downloadConfirmBackdrop.addEventListener('click', e => { if(e.target === downloadConfirmBackdrop) closeDownloadConfirm(); });

function openDownloadConfirm(title, textHtml, actionLabel, onConfirm){
  const body = document.getElementById('downloadConfirmBody');
  body.innerHTML = '<div class="auth-card unlock-card">' +
      '<div class="auth-title">' + escapeHtml(title) + '</div>' +
      '<p class="unlock-sub">' + textHtml + '</p>' +
      '<button type="button" class="auth-submit download-confirm-delete" id="downloadConfirmBtn">' + escapeHtml(actionLabel) + '</button>' +
      '<button type="button" class="unlock-cancel" id="downloadConfirmCancel">Cancel</button>' +
    '</div>';
  document.getElementById('downloadConfirmCancel').addEventListener('click', closeDownloadConfirm);
  document.getElementById('downloadConfirmBtn').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    e.currentTarget.textContent = 'Deleting…';
    await onConfirm();
    closeDownloadConfirm();
  });
  downloadConfirmBackdrop.classList.add('open');
}
function closeDownloadConfirm(){
  downloadConfirmBackdrop.classList.remove('open');
}
