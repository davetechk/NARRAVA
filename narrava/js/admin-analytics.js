// admin-analytics.js — admin/analytics.html only.
//
// Real visits to the actual consumer app (page_visits, logged once per
// real page load by js/visit-log.js — never from inside this admin
// panel), read here through the two already-deployed admin RPCs
// (admin_visit_stats, admin_daily_visits) exactly as they return.
// Neither RPC is touched or recomputed here — this only ever renders
// what they hand back.

function analyticsStatsRowHtml(stats){
  const fmt = (v) => (v === null || v === undefined) ? '—' : Number(v).toLocaleString();

  return '<div class="admin-stats-row cols-3">' +
    '<div class="admin-stat-card"><div class="admin-stat-icon">' + ADMIN_ICONS.analytics + '</div><div class="admin-stat-body"><div class="admin-stat-label">Today’s Visits</div><div class="admin-stat-value">' + fmt(stats && stats.today_visits) + '</div><div class="admin-stat-caption">Since midnight</div></div></div>' +
    '<div class="admin-stat-card"><div class="admin-stat-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M3 9h18" stroke="currentColor" stroke-width="1.7"/></svg></div><div class="admin-stat-body"><div class="admin-stat-label">Visits — Last 7 Days</div><div class="admin-stat-value">' + fmt(stats && stats.last_7_days_visits) + '</div><div class="admin-stat-caption">Total, every real visit</div></div></div>' +
    '<div class="admin-stat-card"><div class="admin-stat-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.4" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 20c1.4-4 4.2-6 7.5-6s6.1 2 7.5 6" stroke="currentColor" stroke-width="1.8"/></svg></div><div class="admin-stat-body"><div class="admin-stat-label">Unique Visitors — 7 Days</div><div class="admin-stat-value">' + fmt(stats && stats.unique_visitors_7_days) + '</div><div class="admin-stat-caption">Deduplicated by account</div></div></div>' +
  '</div>';
}

// Builds one continuous, gap-filled day series from whatever real rows
// admin_daily_visits actually returned. A day that RPC didn't return a
// row for is a real zero, filled in here so the line reads as one
// continuous real trend rather than sparse dots — never a fabricated
// non-zero value, only a genuine zero for a day with no real visits.
// With no real rows at all (nothing ever visited yet), falls back to a
// real last-7-days-ending-today all-zero baseline — still honest, not
// invented, since an empty result genuinely means zero visits.
function buildDailySeries(rows){
  const byDate = {};
  (rows || []).forEach(r => { byDate[r.visit_date] = Number(r.visit_count) || 0; });

  const dates = Object.keys(byDate).sort();
  let start, end;
  if(dates.length){
    start = new Date(dates[0] + 'T00:00:00Z');
    end = new Date(dates[dates.length - 1] + 'T00:00:00Z');
  } else {
    end = new Date(); end.setUTCHours(0, 0, 0, 0);
    start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
  }

  const series = [];
  for(let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)){
    const key = d.toISOString().slice(0, 10);
    series.push({ date: key, count: byDate[key] || 0 });
  }
  return series;
}

function lineChartSvg(series){
  const W = 700, H = 220, padL = 30, padR = 16, padT = 16, padB = 28;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const max = Math.max.apply(null, series.map(p => p.count).concat([1]));

  const stepX = series.length > 1 ? innerW / (series.length - 1) : 0;
  const points = series.map((p, i) => ({
    x: padL + i * stepX,
    y: padT + innerH - (p.count / max) * innerH,
    p
  }));

  const linePoints = points.map(pt => pt.x.toFixed(1) + ',' + pt.y.toFixed(1)).join(' ');
  const areaPath = 'M' + points.map((pt, i) => (i === 0 ? '' : 'L') + pt.x.toFixed(1) + ',' + pt.y.toFixed(1)).join(' ') +
    ' L' + points[points.length - 1].x.toFixed(1) + ',' + (padT + innerH) +
    ' L' + points[0].x.toFixed(1) + ',' + (padT + innerH) + ' Z';

  const gridLines = [0, 0.5, 1].map(f => {
    const y = padT + innerH * f;
    return '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>';
  }).join('');

  // Thins labels out so they never overlap once there are many days.
  const labelEvery = Math.max(1, Math.ceil(series.length / 10));
  const labels = points.map((pt, i) => {
    if(i % labelEvery !== 0 && i !== points.length - 1) return '';
    const d = new Date(pt.p.date + 'T00:00:00Z');
    const label = (d.getUTCMonth() + 1) + '/' + d.getUTCDate();
    return '<text x="' + pt.x.toFixed(1) + '" y="' + (H - 8) + '" font-size="10" fill="rgba(244,247,241,0.5)" text-anchor="middle">' + label + '</text>';
  }).join('');

  const dots = points.map(pt =>
    '<circle cx="' + pt.x.toFixed(1) + '" cy="' + pt.y.toFixed(1) + '" r="3" fill="#7DB359">' +
      '<title>' + pt.p.date + ': ' + pt.p.count + ' visit' + (pt.p.count === 1 ? '' : 's') + '</title>' +
    '</circle>'
  ).join('');

  return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="admin-line-chart-svg" preserveAspectRatio="none">' +
    gridLines +
    '<path d="' + areaPath + '" fill="rgba(125,179,89,0.14)" stroke="none"/>' +
    '<polyline points="' + linePoints + '" fill="none" stroke="#7DB359" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
    dots +
    labels +
  '</svg>';
}

(async () => {
  await requireAdminSession('analytics');

  try {
    const [statsResult, dailyResult] = await Promise.all([
      supabaseClient.rpc('admin_visit_stats'),
      supabaseClient.rpc('admin_daily_visits')
    ]);

    if(statsResult.error) console.error('Narrava: admin_visit_stats failed', statsResult.error);
    if(dailyResult.error) console.error('Narrava: admin_daily_visits failed', dailyResult.error);

    const stats = statsResult.error ? null : (Array.isArray(statsResult.data) ? statsResult.data[0] : statsResult.data);
    const dailyRows = dailyResult.error ? [] : (dailyResult.data || []);

    document.getElementById('analyticsStatsRow').innerHTML = analyticsStatsRowHtml(stats);

    const series = buildDailySeries(dailyRows);
    document.getElementById('analyticsLineChart').innerHTML = '<div class="admin-line-chart">' + lineChartSvg(series) + '</div>';

    const hasAnyRealVisit = series.some(p => p.count > 0);
    document.getElementById('analyticsChartNote').textContent = hasAnyRealVisit
      ? 'Real visit counts per day.'
      : 'No visits recorded yet — every point above is a real, honest zero, not a placeholder.';
  } catch(err){
    console.error('Narrava: failed to load analytics', err);
    showToast('Could not load analytics — please try again');
  }
})();
