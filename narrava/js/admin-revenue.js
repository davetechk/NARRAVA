// admin-revenue.js — admin/revenue-analytics.html only.
//
// Every number on this page comes from ONE server function,
// admin_revenue_overview(p_days) (admin-only; it refuses everyone else),
// and is only displayed here. Nothing is computed from other tables. The
// only arithmetic in this file:
//   - adding rows of the SAME currency together (e.g. coin-pack naira +
//     subscription naira = the period's naira revenue), and
//   - kobo / 100 and cents / 100 for display.
// Naira and dollars are never converted and never added together.

// Periods are rolling windows: p_days × 24 hours back from now, not
// calendar days (so "24 hours" is not "today").
// Checked live (2026-10-05): the function treats a missing p_days as 30,
// 0 as 1, and caps it at 3650. So "All time" sends 3650: its money comes
// from totals_all_time (truly all time), while its *_period ad figures
// cover the last 3650 days, which the captions say.
const REVENUE_ALL_TIME_DAYS = 3650;
const REVENUE_PERIODS = [
  { key: '24h', label: '24 hours', days: 1 },
  { key: '7', label: '7 days', days: 7 },
  { key: '30', label: '30 days', days: 30 },
  { key: 'all', label: 'All time', days: REVENUE_ALL_TIME_DAYS }
];
const REVENUE_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'coins', label: 'Coins' },
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'ads', label: 'Ads' }
];
// Plans always listed on the Subscriptions tab, even with 0 subscribers.
const REVENUE_PLANS = [
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' }
];
const REVENUE_CURRENCIES = ['NGN', 'USD'];
const REVENUE_TIMEOUT_MS = 20000;

const rev = {
  period: REVENUE_PERIODS[2],
  tab: 'overview',
  data: null,      // the function's last answer, as-is
  loading: true,
  error: null,
  request: 0,      // only the latest request may render (fast period switching)
  coinPackCoins: {} // coin_packs id -> coins, only to label "50 coins" in Recent purchases
};

// ---------- formatting (no other maths) ----------

function formatCount(n){
  return Number(n || 0).toLocaleString('en-US');
}

function formatLagosDate(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  if(isNaN(d)) return escapeHtml(String(iso));
  return d.toLocaleString('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// The totals array for the chosen period, filtered to some purchase types,
// added up per currency (never across currencies).
function totalsByCurrency(types){
  const d = rev.data || {};
  const rows = (rev.period.key === 'all' ? d.totals_all_time : d.totals_period) || [];
  const out = {};
  REVENUE_CURRENCIES.forEach(c => { out[c] = { amount: 0, purchases: 0 }; });
  rows.forEach(r => {
    if(types.indexOf(r.type) === -1) return;
    if(!out[r.currency]) out[r.currency] = { amount: 0, purchases: 0 };
    out[r.currency].amount += Number(r.amount_minor) || 0;
    out[r.currency].purchases += Number(r.purchases) || 0;
  });
  return out;
}

function purchaseCount(byCurrency){
  return Object.keys(byCurrency).reduce((sum, c) => sum + byCurrency[c].purchases, 0);
}

// ---------- building blocks ----------

const REV_ICONS = {
  naira: '<span class="rev-currency-glyph">₦</span>',
  dollar: '<span class="rev-currency-glyph">$</span>',
  cart: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 4h2l2.4 11.2a2 2 0 002 1.6h7.7a2 2 0 002-1.5L21 8H6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="20" r="1.3" fill="currentColor"/><circle cx="17" cy="20" r="1.3" fill="currentColor"/></svg>',
  star: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.1 6.6L12 17.6l-5.8 3 1.1-6.6-4.8-4.6 6.6-.9 2.9-6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  play: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M10 9.5v5l4.5-2.5L10 9.5z" fill="currentColor"/></svg>',
  coin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M9.5 15.5v-7l5 7v-7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  gift: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="9" width="17" height="11" rx="1.5" stroke="currentColor" stroke-width="1.7"/><path d="M3.5 13h17M12 9v11M12 9c-1.5-3-5-3.5-5-1.2C7 9 12 9 12 9zm0 0c1.5-3 5-3.5 5-1.2C17 9 12 9 12 9z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  unlock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="4.5" y="10.5" width="15" height="10" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M8 10.5V7a4 4 0 017.7-1.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  people: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3.2" stroke="currentColor" stroke-width="1.7"/><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M16 5.2a3 3 0 010 5.6M18 14.3c1.6.7 2.7 2.2 3 4.7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  alert: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3.5l9.5 16.5h-19L12 3.5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 10v4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1" fill="currentColor"/></svg>'
};

// cardClass 'rev-money-card': a money figure, which must never break mid-number.
function statCardHtml(icon, label, value, caption, tone, cardClass){
  return '<div class="admin-stat-card' + (cardClass ? ' ' + cardClass : '') + '"><div class="admin-stat-icon' + (tone ? ' ' + tone : '') + '">' + icon + '</div>' +
    '<div class="admin-stat-body"><div class="admin-stat-label">' + label + '</div>' +
    '<div class="admin-stat-value">' + value + '</div>' +
    '<div class="admin-stat-caption">' + caption + '</div></div></div>';
}

// One card per currency, always both, never combined.
function currencyCardsHtml(label, byCurrency){
  const cap = moneyCaption();
  return REVENUE_CURRENCIES.map(c => {
    const t = byCurrency[c];
    const caption = cap + ' · ' + (t.purchases ? formatCount(t.purchases) + ' purchase' + (t.purchases === 1 ? '' : 's') : (rev.period.key === 'all' ? 'No purchases yet' : 'No purchases in this period'));
    return statCardHtml(c === 'NGN' ? REV_ICONS.naira : REV_ICONS.dollar, label + (c === 'NGN' ? ' (Naira)' : ' (US Dollar)'), formatMinorAmount(t.amount, c), caption, null, 'rev-money-card');
  }).join('') +
  // A currency the page doesn't know about (never expected) is still shown, separately.
  Object.keys(byCurrency).filter(c => REVENUE_CURRENCIES.indexOf(c) === -1 && byCurrency[c].purchases).map(c =>
    statCardHtml(REV_ICONS.cart, label + ' (' + escapeHtml(c) + ')', formatMinorAmount(byCurrency[c].amount, c), moneyCaption(), null, 'rev-money-card')
  ).join('');
}

function alertCardHtml(title, count, text){
  return '<div class="rev-alert" role="alert"><div class="rev-alert-icon">' + REV_ICONS.alert + '</div>' +
    '<div><div class="rev-alert-title">' + title + ' <span class="rev-alert-count">' + formatCount(count) + '</span></div>' +
    '<div class="rev-alert-text">' + text + '</div>' +
    '<div class="rev-alert-scope">' + ALL_TIME_CAPTION + '</div></div></div>';
}

// ---------- tabs ----------

function overviewHtml(){
  const d = rev.data;
  const all = totalsByCurrency(REVENUE_PURCHASE_TYPES);
  const purchases = purchaseCount(all);
  const subscribers = (d.active_subscribers || []).reduce((sum, r) => sum + (Number(r.subscribers) || 0), 0);
  const ads = d.ads || {};
  const needsReview = Number(d.needs_review) || 0;
  const refundFailed = Number(d.refunds && d.refunds.refund_failed) || 0;

  let html = '';
  if(needsReview > 0) html += alertCardHtml('Needs review', needsReview, 'A payment didn’t match what was expected. Check Paystack before refunding or crediting manually.');
  if(refundFailed > 0) html += alertCardHtml('Refunds that failed', refundFailed, 'Refund manually in Paystack.');
  html += '<div class="admin-stats-row cols-3">' +
    currencyCardsHtml('Revenue', all) +
    statCardHtml(REV_ICONS.cart, 'Purchases', formatCount(purchases), moneyCaption() + ' · coins and subscriptions') +
  '</div>' +
  '<div class="admin-stats-row cols-2">' +
    statCardHtml(REV_ICONS.star, 'Active subscribers', formatCount(subscribers), 'Right now, all plans', 'orange') +
    statCardHtml(REV_ICONS.play, 'Ad views', formatCount(ads.views_period), periodCaption()) +
  '</div>';
  return html;
}

function coinsHtml(){
  const coins = rev.data.coins || {};
  const packs = totalsByCurrency(['coin_pack']);
  return '<div class="admin-stats-row cols-3">' +
      currencyCardsHtml('Coin pack revenue', packs) +
      statCardHtml(REV_ICONS.cart, 'Coin pack purchases', formatCount(purchaseCount(packs)), moneyCaption()) +
    '</div>' +
    '<div class="admin-stats-row cols-3">' +
      statCardHtml(REV_ICONS.coin, 'Coins bought', formatCount(coins.bought), ALL_TIME_CAPTION) +
      statCardHtml(REV_ICONS.gift, 'Welcome coins given', formatCount(coins.welcome), ALL_TIME_CAPTION, 'orange') +
      statCardHtml(REV_ICONS.unlock, 'Coins spent', formatCount(coins.spent), ALL_TIME_CAPTION) +
    '</div>';
}

function subscriptionsHtml(){
  const subs = totalsByCurrency(['subscription']);
  const byPlan = {};
  (rev.data.active_subscribers || []).forEach(r => { byPlan[r.plan_id] = Number(r.subscribers) || 0; });
  const known = REVENUE_PLANS.map(p => p.id);
  const extra = Object.keys(byPlan).filter(id => known.indexOf(id) === -1).map(id => ({ id, label: id }));
  const plans = REVENUE_PLANS.concat(extra);
  const total = plans.reduce((sum, p) => sum + (byPlan[p.id] || 0), 0);

  return '<div class="admin-stats-row cols-3">' +
      currencyCardsHtml('Subscription revenue', subs) +
      statCardHtml(REV_ICONS.cart, 'Subscription purchases', formatCount(purchaseCount(subs)), moneyCaption()) +
    '</div>' +
    '<div class="admin-panel">' +
      '<div class="admin-panel-head"><div><h2>Active subscribers per plan</h2><div class="admin-panel-sub">Right now, whatever period is chosen above · ' + formatCount(total) + ' in total</div></div></div>' +
      '<div class="rev-plan-list">' +
        plans.map(p =>
          '<div class="rev-plan-row"><span class="rev-plan-name">' + escapeHtml(p.label) + '</span><span class="rev-plan-count">' + formatCount(byPlan[p.id] || 0) + '</span></div>'
        ).join('') +
      '</div>' +
    '</div>';
}

function adsHtml(){
  const ads = rev.data.ads || {};
  return '<div class="admin-stats-row cols-4">' +
      statCardHtml(REV_ICONS.play, 'Ad views today', formatCount(ads.views_today), 'Today (Lagos time)') +
      statCardHtml(REV_ICONS.play, 'Ad views', formatCount(ads.views_period), periodCaption()) +
      statCardHtml(REV_ICONS.people, 'People who watched ads', formatCount(ads.viewers_period), periodCaption(), 'orange') +
      statCardHtml(REV_ICONS.unlock, 'Episodes unlocked with ads', formatCount(ads.unlocks_period), periodCaption()) +
    '</div>' +
    '<div class="admin-helper-text rev-ads-note">Ad earnings are reported in your Google Ad Manager account, not here.</div>';
}

// Money totals: the period the server says it used, or all time. Periods
// are rolling (p_days × 24 hours), so 1 day reads "Last 24 hours".
function moneyCaption(){
  if(rev.period.key === 'all') return 'All time';
  const days = Number(rev.data && rev.data.period_days) || rev.period.days;
  return days === 1 ? 'Last 24 hours' : 'Last ' + formatCount(days) + ' days';
}
// The ads *_period figures always follow p_days, even for "All time".
function periodCaption(){
  if(rev.period.key !== 'all') return moneyCaption();
  const days = Number(rev.data && rev.data.period_days) || rev.period.days;
  return 'All time (last ' + formatCount(days) + ' days)';
}
// coins { bought, welcome, spent }, refunds and needs_review come back the
// same for every p_days: they're all-time figures.
const ALL_TIME_CAPTION = 'All time · not affected by the period';

// ---------- recent purchases ----------

const PURCHASE_STATUS_BADGES = {
  completed: ['green', 'Completed'],
  pending: ['gray', 'Pending'],
  failed: ['red', 'Failed'],
  refunded: ['orange', 'Refunded'],
  refund_failed: ['orange', 'Refund failed'],
  refunding: ['orange', 'Refunding']
};

function purchaseWhat(p){
  if(p.type === 'subscription'){
    const plan = REVENUE_PLANS.find(x => x.id === p.item_id);
    return plan ? plan.label : escapeHtml(String(p.item_id || 'Subscription'));
  }
  if(p.type === 'coin_pack'){
    const coins = rev.coinPackCoins[p.item_id];
    return typeof coins === 'number' ? formatCount(coins) + ' coins' : 'Coin pack ' + escapeHtml(String(p.item_id || ''));
  }
  return escapeHtml(String(p.type || '—'));
}

function recentRowHtml(p){
  const badge = PURCHASE_STATUS_BADGES[p.status] || ['gray', escapeHtml(String(p.status || 'Unknown'))];
  return '<tr>' +
    '<td><span class="rev-recent-date">' + formatLagosDate(p.created_at) + '</span></td>' +
    '<td><span class="rev-recent-email">' + (p.email ? escapeHtml(p.email) : '<span class="rev-muted">No email</span>') + '</span></td>' +
    '<td>' + purchaseWhat(p) + '</td>' +
    '<td class="rev-amount">' + formatMinorAmount(p.amount_minor, p.currency) + '</td>' +
    '<td><div class="rev-status-cell"><span class="admin-badge ' + badge[0] + '">' + badge[1] + '</span>' +
      (p.failure_reason ? '<span class="rev-failure">' + escapeHtml(String(p.failure_reason)) + '</span>' : '') +
    '</div></td>' +
  '</tr>';
}

const RECENT_HEAD = '<thead><tr><th>Date</th><th>Email</th><th>What</th><th>Amount</th><th>Status</th></tr></thead>';

function recentHtml(){
  const rows = rev.data.recent || [];
  if(!rows.length) return '<div class="admin-empty">No purchases yet.</div>';
  return '<div class="admin-table-wrap rev-recent-scroll" tabindex="0" aria-label="Recent purchases, scrollable">' +
    '<table class="admin-table rev-recent-table">' + RECENT_HEAD + '<tbody>' + rows.map(recentRowHtml).join('') + '</tbody></table>' +
  '</div>';
}

// ---------- loading / error ----------

function skeletonStatCardHtml(){
  return '<div class="admin-stat-card">' + skeletonBoxHtml('38px', '38px', '10px') +
    '<div class="admin-stat-body" style="flex:1;">' + skeletonBoxHtml('70%', '11px', '4px') +
    '<div style="margin:8px 0 6px;">' + skeletonBoxHtml('55%', '20px', '4px') + '</div>' + skeletonBoxHtml('80%', '10px', '4px') + '</div></div>';
}
function skeletonTabHtml(){
  let cards = '';
  for(let i = 0; i < 3; i++) cards += skeletonStatCardHtml();
  return '<div class="admin-stats-row cols-3">' + cards + '</div><div class="admin-stats-row cols-2">' + skeletonStatCardHtml() + skeletonStatCardHtml() + '</div>';
}
function skeletonRecentHtml(count){
  let rows = '';
  for(let i = 0; i < count; i++){
    rows += '<tr>' +
      '<td>' + skeletonBoxHtml('110px', '13px', '4px') + '</td>' +
      '<td>' + skeletonBoxHtml('150px', '13px', '4px') + '</td>' +
      '<td>' + skeletonBoxHtml('70px', '13px', '4px') + '</td>' +
      '<td>' + skeletonBoxHtml('64px', '13px', '4px') + '</td>' +
      '<td>' + skeletonBoxHtml('76px', '20px', '20px') + '</td>' +
    '</tr>';
  }
  return '<div class="admin-table-wrap rev-recent-scroll"><table class="admin-table rev-recent-table">' + RECENT_HEAD + '<tbody>' + rows + '</tbody></table></div>';
}

function errorHtml(){
  return '<div class="admin-panel rev-error"><div class="admin-empty">Couldn’t load revenue figures. ' + escapeHtml(rev.error || '') +
    '<div style="margin-top:14px;"><button type="button" class="admin-btn admin-btn-primary small" data-rev-retry>Try again</button></div></div></div>';
}

// ---------- render ----------

function renderPeriods(){
  document.getElementById('revPeriods').innerHTML = REVENUE_PERIODS.map(p =>
    '<button type="button" class="rev-period-btn' + (p === rev.period ? ' active' : '') + '" data-period="' + p.key + '" aria-pressed="' + (p === rev.period) + '">' + p.label + '</button>'
  ).join('');
}

function renderTabs(){
  document.getElementById('revTabs').innerHTML = REVENUE_TABS.map(t =>
    '<button type="button" role="tab" class="rev-tab' + (t.key === rev.tab ? ' active' : '') + '" data-tab="' + t.key + '" aria-selected="' + (t.key === rev.tab) + '">' + t.label + '</button>'
  ).join('');
}

function renderRevenue(){
  renderPeriods();
  renderTabs();
  const panel = document.getElementById('revTabPanel');
  const recent = document.getElementById('revRecentWrap');

  if(rev.loading && !rev.data){
    panel.innerHTML = skeletonTabHtml();
    recent.innerHTML = skeletonRecentHtml(5);
    return;
  }
  if(rev.error){
    panel.innerHTML = errorHtml();
    recent.innerHTML = '<div class="admin-empty">Recent purchases couldn’t be loaded.</div>';
    return;
  }
  const builders = { overview: overviewHtml, coins: coinsHtml, subscriptions: subscriptionsHtml, ads: adsHtml };
  panel.innerHTML = rev.loading ? skeletonTabHtml() : builders[rev.tab]();
  recent.innerHTML = rev.loading ? skeletonRecentHtml(5) : recentHtml();
}

function withTimeout(promise, ms){
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('The server took too long to answer.')), ms))
  ]);
}

async function loadRevenue(){
  const myRequest = ++rev.request;
  rev.loading = true;
  rev.error = null;
  rev.data = null;
  showSkeletonLogo();
  renderRevenue();
  try {
    const { data, error } = await withTimeout(
      supabaseClient.rpc('admin_revenue_overview', { p_days: rev.period.days }),
      REVENUE_TIMEOUT_MS
    );
    if(myRequest !== rev.request) return; // a newer period was chosen meanwhile
    if(error) throw error;
    if(!data || typeof data !== 'object') throw new Error('The server returned no figures.');
    rev.data = data;
  } catch(err){
    if(myRequest !== rev.request) return;
    console.error('Narrava: admin_revenue_overview failed', err);
    rev.error = (err && err.message) ? err.message : '';
  }
  rev.loading = false;
  hideSkeletonLogo();
  renderRevenue();
}

// Coin pack sizes, only for "50 coins" labels in Recent purchases. If this
// fails the label falls back to the pack id; no figure depends on it.
async function loadCoinPackLabels(){
  try {
    const { data, error } = await supabaseClient.from('coin_packs').select('id, coins');
    if(error) throw error;
    (data || []).forEach(p => { rev.coinPackCoins[p.id] = p.coins; });
    if(rev.data && !rev.loading) renderRevenue();
  } catch(err){
    console.error('Narrava: failed to load coin pack labels', err);
  }
}

document.getElementById('revPeriods').addEventListener('click', e => {
  const btn = e.target.closest('[data-period]');
  if(!btn) return;
  const p = REVENUE_PERIODS.find(x => x.key === btn.dataset.period);
  if(!p || (p === rev.period && !rev.error)) return;
  rev.period = p;
  loadRevenue();
});
document.getElementById('revTabs').addEventListener('click', e => {
  const btn = e.target.closest('[data-tab]');
  if(!btn || btn.dataset.tab === rev.tab) return;
  rev.tab = btn.dataset.tab;
  renderRevenue();
});
document.getElementById('revTabPanel').addEventListener('click', e => {
  if(e.target.closest('[data-rev-retry]')) loadRevenue();
});

(async () => {
  await requireAdminSession('revenue-analytics');
  loadCoinPackLabels();
  await loadRevenue();
})();
