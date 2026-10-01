// admin-most-watched.js — admin/most-watched.html only.
//
// Read-only report: every real series ranked by real views, from
// admin_most_watched_series (already ranked server-side — never
// re-sorted or recalculated here). Same skeleton/error/empty shape as
// Series List and Episodes (admin-series-list.js, admin-episodes.js).

let mwRows = [];

function mostWatchedRowHtml(row, rank){
  const isPublished = row.status === 'published';
  const cover = row.cover_image_url ? 'background-image:url(\'' + row.cover_image_url.replace(/'/g, '') + '\');' : '';

  return '<tr>' +
    '<td>' + rank + '</td>' +
    '<td><div class="admin-row-cell"><div class="admin-thumb" style="' + cover + '"></div><span class="admin-row-title">' + escapeHtml(row.title) + '</span></div></td>' +
    '<td><span class="admin-badge ' + (isPublished ? 'green' : 'gray') + '">' + (isPublished ? 'Live' : 'Draft') + '</span></td>' +
    '<td>' + Number(row.views || 0).toLocaleString() + '</td>' +
    '<td>' + Number(row.likes || 0).toLocaleString() + '</td>' +
    '<td>' + Number(row.comments || 0).toLocaleString() + '</td>' +
    '<td>' + Number(row.saves || 0).toLocaleString() + '</td>' +
    '<td>' + Number(row.shares || 0).toLocaleString() + '</td>' +
  '</tr>';
}

function renderMostWatchedTable(){
  const wrap = document.getElementById('mostWatchedTableWrap');
  if(!mwRows.length){
    wrap.innerHTML = '<div class="admin-empty">No series yet.</div>';
    return;
  }
  wrap.innerHTML = '<div class="admin-table-wrap"><table class="admin-table">' +
    '<thead><tr><th>#</th><th>Series</th><th>Status</th><th>Views</th><th>Likes</th><th>Comments</th><th>Saves</th><th>Shares</th></tr></thead>' +
    '<tbody>' + mwRows.map((row, i) => mostWatchedRowHtml(row, i + 1)).join('') + '</tbody>' +
  '</table></div>';
}

(async () => {
  await requireAdminSession('most-watched');
  showSkeletonLogo();
  document.getElementById('mostWatchedTableWrap').innerHTML = skeletonAdminMostWatchedTableHtml(8);

  try {
    const { data, error } = await supabaseClient.rpc('admin_most_watched_series', { result_limit: 200 });
    if(error) throw error;
    mwRows = data || [];
    renderMostWatchedTable();
  } catch(err){
    console.error('Narrava: failed to load most watched series', err);
    showToast('Could not load most watched series — please try again');
    document.getElementById('mostWatchedTableWrap').innerHTML = '<div class="admin-empty">Could not load most watched series — please try again.</div>';
  } finally {
    hideSkeletonLogo();
  }
})();
