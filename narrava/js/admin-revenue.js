// admin-revenue.js — admin/revenue-analytics.html only.
//
// Real numbers throughout, several of them honestly zero right now
// since Paystack isn't live yet — that's correct, not a bug. Two real
// gaps worth being explicit about in the code, not just the UI:
//   - `purchases` has no per-row status vocabulary this app can verify
//     yet (the table is currently empty in production), so "coin
//     purchases" here counts every row rather than filtering on a
//     guessed status string — once real Paystack rows exist with a
//     known status shape, that filter can be tightened.
//   - `coin_transactions` has a bare `reference_id` column with no
//     type discriminator, so attributing a transaction to a series
//     means treating reference_id as an episode id and following it to
//     that episode's series. That's the only relationship in the app
//     that makes sense (coins are spent unlocking an episode), but it
//     is an inferred join, not a documented one.

function weekBuckets(count){
  const buckets = [];
  const now = new Date();
  for(let i = count - 1; i >= 0; i--){
    const end = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    buckets.push({ start, end, total: 0 });
  }
  return buckets;
}

function statsRowHtml(totalRevenue, coinPurchaseCount){
  const revenueDisplay = (totalRevenue === null || totalRevenue === undefined) ? '—' : formatNaira(totalRevenue);
  return '<div class="admin-stats-row cols-4">' +
    '<div class="admin-stat-card"><div class="admin-stat-icon">' + ADMIN_ICONS.revenue + '</div><div class="admin-stat-body"><div class="admin-stat-label">Total Revenue</div><div class="admin-stat-value">' + revenueDisplay + '</div><div class="admin-stat-caption">Lifetime</div></div></div>' +
    '<div class="admin-stat-card"><div class="admin-stat-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M12 7v6l4 2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></div><div class="admin-stat-body"><div class="admin-stat-label">Coin Purchases</div><div class="admin-stat-value">' + coinPurchaseCount + '</div><div class="admin-stat-caption">Coin top-ups to date</div></div></div>' +
    '<div class="admin-stat-card"><div class="admin-stat-icon orange"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.1 6.6L12 17.6l-5.8 3 1.1-6.6-4.8-4.6 6.6-.9 2.9-6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg></div><div class="admin-stat-body"><div class="admin-stat-label">Subscriptions</div><div class="admin-stat-value">Inactive</div><div class="admin-stat-caption">Not yet enabled</div></div></div>' +
    '<div class="admin-stat-card"><div class="admin-stat-icon red"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M3 9h18" stroke="currentColor" stroke-width="1.7"/></svg></div><div class="admin-stat-body"><div class="admin-stat-label">Ad Revenue</div><div class="admin-stat-value">Inactive</div><div class="admin-stat-caption">Not yet enabled</div></div></div>' +
  '</div>';
}

function barChartHtml(buckets){
  const max = Math.max.apply(null, buckets.map(b => b.total).concat([1]));
  return buckets.map((b, i) => {
    const pct = Math.max(4, Math.round((b.total / max) * 100));
    return '<div class="admin-bar-col"><div class="admin-bar-value">' + formatNaira(b.total) + '</div><div class="admin-bar" style="height:' + pct + '%;"></div><div class="admin-bar-label">Wk ' + (i + 1) + '</div></div>';
  }).join('');
}

function legendHtml(coinRevenue, totalRevenue){
  const hasRevenue = totalRevenue > 0;
  const coinLabel = hasRevenue ? formatNaira(coinRevenue) : 'Only active channel';
  return (
    '<div class="admin-legend-row"><span><span class="admin-legend-dot" style="background:var(--leaf);"></span>Coin purchases</span><span>' + coinLabel + '</span></div>' +
    '<div class="admin-progress-track" style="margin-bottom:16px;"><div class="admin-progress-fill" style="width:100%;"></div></div>' +
    '<div class="admin-legend-row"><span><span class="admin-legend-dot" style="background:rgba(255,255,255,0.15);"></span>Subscriptions</span><span>Inactive</span></div>' +
    '<div class="admin-progress-track" style="margin-bottom:16px;"><div class="admin-progress-fill" style="width:0%;"></div></div>' +
    '<div class="admin-legend-row"><span><span class="admin-legend-dot" style="background:rgba(255,255,255,0.15);"></span>Ad revenue</span><span>Inactive</span></div>' +
    '<div class="admin-progress-track"><div class="admin-progress-fill" style="width:0%;"></div></div>'
  );
}

function topSeriesTableHtml(series, episodeCounts, coinsBySeriesId){
  if(!series.length) return '<div class="admin-empty">No series yet.</div>';

  const ranked = series.slice().sort((a, b) => (coinsBySeriesId[b.id] || 0) - (coinsBySeriesId[a.id] || 0));

  const rows = ranked.map(s => {
    const cover = s.cover_image_url ? 'background-image:url(\'' + s.cover_image_url.replace(/'/g, '') + '\');' : '';
    return '<tr>' +
      '<td><div class="admin-row-cell"><div class="admin-thumb" style="' + cover + '"></div><span class="admin-row-title">' + escapeHtml(s.title) + '</span></div></td>' +
      '<td>' + (episodeCounts[s.id] || 0) + '</td>' +
      '<td>' + (coinsBySeriesId[s.id] || 0) + ' coins</td>' +
    '</tr>';
  }).join('');

  return '<div class="admin-table-wrap"><table class="admin-table">' +
    '<thead><tr><th>Series</th><th>Episodes</th><th>Coins Spent</th></tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
  '</table></div>';
}

(async () => {
  await requireAdminSession('revenue-analytics');

  try {
    const [core, revenueResult, purchasesResult, coinTxResult, episodesResult] = await Promise.all([
      loadCoreAdminData(),
      supabaseClient.rpc('admin_total_revenue'),
      supabaseClient.from('purchases').select('id, amount, created_at'),
      supabaseClient.from('coin_transactions').select('id, amount, reference_id, created_at'),
      supabaseClient.from('episodes').select('id, series_id')
    ]);

    const totalRevenue = revenueResult.error ? null : revenueResult.data;
    if(revenueResult.error) console.error('Narrava: admin_total_revenue failed', revenueResult.error);

    if(purchasesResult.error) console.error('Narrava: failed to load purchases', purchasesResult.error);
    if(coinTxResult.error) console.error('Narrava: failed to load coin_transactions', coinTxResult.error);
    if(episodesResult.error) console.error('Narrava: failed to load episodes', episodesResult.error);

    const purchases = purchasesResult.data || [];
    const coinTransactions = coinTxResult.data || [];
    const episodes = episodesResult.data || [];

    document.getElementById('revenueStatsRow').innerHTML = statsRowHtml(totalRevenue, purchases.length);

    // --- Weekly bar chart, real purchase amounts bucketed by week ---
    const buckets = weekBuckets(7);
    purchases.forEach(p => {
      const created = new Date(p.created_at);
      const bucket = buckets.find(b => created >= b.start && created < b.end);
      if(bucket) bucket.total += Number(p.amount) || 0;
    });
    document.getElementById('revenueBarChart').innerHTML = barChartHtml(buckets);
    document.getElementById('revenueBarNote').textContent = purchases.length
      ? 'Real purchase totals, grouped into the last 7 weeks.'
      : 'No purchases recorded yet — every bar above is a real, honest zero, not a placeholder.';

    // --- Revenue sources legend ---
    const coinRevenue = purchases.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    document.getElementById('revenueSourcesLegend').innerHTML = legendHtml(coinRevenue, totalRevenue || 0);

    // --- Top performing series: coin_transactions.reference_id -> episode -> series ---
    const episodeToSeries = {};
    episodes.forEach(ep => { episodeToSeries[ep.id] = ep.series_id; });

    const episodeCounts = {};
    episodes.forEach(ep => { episodeCounts[ep.series_id] = (episodeCounts[ep.series_id] || 0) + 1; });

    const coinsBySeriesId = {};
    coinTransactions.forEach(tx => {
      const seriesId = tx.reference_id ? episodeToSeries[tx.reference_id] : null;
      if(!seriesId) return; // not tied to a known episode (e.g. a coin top-up, not a spend)
      coinsBySeriesId[seriesId] = (coinsBySeriesId[seriesId] || 0) + (Number(tx.amount) || 0);
    });

    document.getElementById('topSeriesTableWrap').innerHTML = topSeriesTableHtml(core.series, episodeCounts, coinsBySeriesId);
  } catch(err){
    console.error('Narrava: failed to load revenue analytics', err);
    showToast('Could not load revenue analytics — please try again');
  }
})();
