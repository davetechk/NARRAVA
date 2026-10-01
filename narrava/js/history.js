// history.js
//
// The History screen (Profile -> History): every series this viewer has
// watched, newest first, straight from get_watch_history — a database
// function that only ever returns the signed-in caller's own rows (an
// anonymous account counts; it has real watch_progress of its own). One
// row per series: cover, title, the last episode watched, and when.
//
// Built like Library (library.js): same .library shell/header/body,
// same skeleton + one faint center logo while loading, re-fetched fresh
// every time the screen is opened. Tapping a row goes through app.js's
// openSeriesInFeed — the exact same path a Library poster or the
// Continue Watching bar uses, including its silent resume.
//
// Three honest end states, and the skeleton never outlives the request
// (withTimeout, shared-utils.js): the list, "Nothing watched yet.", or
// an error with a retry.

const historyBody = document.getElementById('historyBody');
const historyBackBtn = document.getElementById('historyBackBtn');
const HISTORY_TIMEOUT_MS = 10000;

// Bumped on every render, so a slow earlier request that resolves after
// the screen was reopened can't overwrite the newer result.
let historyRenderToken = 0;

function skeletonHistoryRowsHtml(count){
  let html = '';
  for(let i = 0; i < count; i++){
    html += '<div class="history-row">' +
      skeletonBoxHtml('54px', '81px', '8px') +
      '<div class="history-info">' +
        skeletonBoxHtml('60%', '14px', '4px') +
        '<div style="margin-top:8px;">' + skeletonBoxHtml('70px', '12px', '4px') + '</div>' +
      '</div>' +
    '</div>';
  }
  return html;
}

function historyRowHtml(row){
  const slide = slides.find(s => s.id === row.series_id);
  // The function's own cover first; the loaded series' art if it has none.
  const src = row.cover_image_url || (slide ? posterArtSrc(slide) : '');
  const title = row.title || (slide ? slide.title : '');
  return '<button type="button" class="history-row" data-series-id="' + escapeHtml(row.series_id) + '">' +
    '<div class="history-cover">' + (src ? '<img src="' + escapeHtml(src) + '" alt="">' : '') + '</div>' +
    '<div class="history-info">' +
      '<div class="history-title">' + escapeHtml(title) + '</div>' +
      '<div class="history-ep">Episode ' + escapeHtml(row.last_episode_number) + '</div>' +
    '</div>' +
    '<div class="history-date">' + formatWatchedDate(row.last_watched_at) + '</div>' +
  '</button>';
}

async function renderHistoryScreen(){
  const token = ++historyRenderToken;
  showSkeletonLogo();
  historyBody.innerHTML = '<div class="history-list">' + skeletonHistoryRowsHtml(6) + '</div>';

  let rows;
  try {
    const [result] = await Promise.all([
      withTimeout(supabaseClient.rpc('get_watch_history', { result_limit: 100 }), HISTORY_TIMEOUT_MS),
      slidesReady
    ]);
    if(result.error) throw result.error;
    rows = Array.isArray(result.data) ? result.data : [];
  } catch(err){
    if(token !== historyRenderToken) return;
    console.error('Narrava: failed to load watch history', err);
    hideSkeletonLogo();
    historyBody.innerHTML =
      '<div class="discover-empty">Couldn’t load your history right now.<br>' +
      '<button type="button" class="pill-cta-btn" id="historyRetryBtn">Try again</button>' +
      '</div>';
    document.getElementById('historyRetryBtn').addEventListener('click', renderHistoryScreen);
    return;
  }
  if(token !== historyRenderToken) return;

  hideSkeletonLogo();
  if(rows.length === 0){
    historyBody.innerHTML = '<div class="discover-empty">Nothing watched yet.</div>';
    return;
  }

  historyBody.innerHTML = '<div class="history-list">' + rows.map(historyRowHtml).join('') + '</div>';
  historyBody.querySelectorAll('.history-row').forEach(el => {
    el.addEventListener('click', () => {
      const i = slides.findIndex(s => s.id === el.dataset.seriesId);
      // Watched once, but no longer among the loaded (published) series.
      if(i === -1){ showToast('That series isn’t available'); return; }
      openSeriesInFeed(i);
    });
  });
}

// Same as the browser's own Back (nav.js) — returns to Profile.
historyBackBtn.addEventListener('click', () => navBack());
