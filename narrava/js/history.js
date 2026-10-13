// History screen: series this viewer watched, newest first

const historyBody = document.getElementById('historyBody');
const historyBackBtn = document.getElementById('historyBackBtn');
const HISTORY_TIMEOUT_MS = 10000;

// Stops a slow older request overwriting a newer render
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
      '<div class="discover-empty">Couldn’t load your history.<br>' +
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
      // Watched before, but no longer published
      if(i === -1){ showToast('That series isn’t available'); return; }
      openSeriesInFeed(i);
    });
  });
}

historyBackBtn.addEventListener('click', () => navBack());
