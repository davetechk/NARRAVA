// membership.js
//
// The Membership screen (Profile -> Narrava Membership banner, or the
// VIP tab's "Get yearly"). Built like History and Help & Feedback: same
// .library shell, header and back arrow, Profile stays highlighted.
//
// Everything shown comes from the server: the plans from
// subscription_plans, the person's status from my_subscription()
// (coinState.subscription, coins.js), and the Subscription Payments
// switch from app_settings. Subscribing/extending runs the one shared
// purchase flow, startPaystackPurchase('subscription', planId)
// (coins.js) — the server prices it and the webhook grants the days.
// Buying again while subscribed adds the new days after the current end
// date (the server does that; this screen only says so).

const membershipBody = document.getElementById('membershipBody');
const membershipBackBtn = document.getElementById('membershipBackBtn');

let membershipPlans = [];
let subscriptionsEnabled = false;
let membershipState = 'idle'; // 'loading' | 'ready' | 'failed'

function openMembershipScreen(){
  clearFinishedPurchase();
  showScreen('membership');
  renderMembershipScreen();
}

// Plans + switch re-read on every open (an admin change shows up without
// a reload), and my_subscription refreshed with them.
async function renderMembershipScreen(){
  membershipState = membershipPlans.length ? 'ready' : 'loading';
  paintMembership();
  try {
    const [plans, settings] = await Promise.all([
      supabaseClient.from('subscription_plans').select('id, name, days, price_ngn_kobo, price_usd_cents, sort_order, active').eq('active', true).order('sort_order', { ascending: true }),
      supabaseClient.from('app_settings').select('subscriptions_enabled').eq('id', true).single(),
      coinState.userId ? refreshEntitlements() : Promise.resolve()
    ]);
    if(plans.error) throw plans.error;
    if(settings.error) throw settings.error;
    membershipPlans = plans.data || [];
    subscriptionsEnabled = !!(settings.data && settings.data.subscriptions_enabled);
    membershipState = 'ready';
  } catch(err){
    console.error('Narrava: failed to load membership plans', err);
    if(!membershipPlans.length) membershipState = 'failed';
  }
  paintMembership();
}

const MEMBERSHIP_CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>';

function membershipStatusHtml(){
  if(!hasActiveSubscription()) return '';
  const sub = coinState.subscription;
  return '<div class="membership-status">' +
      '<div class="membership-status-label">Your plan</div>' +
      '<div class="membership-status-plan">' + escapeHtml(sub.plan_name || 'Subscription') + (isVipMember() ? ' <span class="vip-badge">VIP</span>' : '') + '</div>' +
      '<div class="membership-status-until">Unlimited watching until ' + escapeHtml(formatShortDate(sub.ends_at)) + '</div>' +
      '<ul class="membership-included">' +
        '<li>' + MEMBERSHIP_CHECK_SVG + 'Every episode unlocked</li>' +
        (isVipMember() ? '<li>' + MEMBERSHIP_CHECK_SVG + 'VIP</li>' : '') +
      '</ul>' +
    '</div>';
}

function membershipPlanHtml(plan, buttonLabel, busy){
  return '<div class="membership-plan">' +
      '<div class="membership-plan-text">' +
        '<div class="membership-plan-name">' + escapeHtml(plan.name) +
          (plan.id === 'yearly' ? ' <span class="membership-vip-label">Includes VIP</span>' : '') +
        '</div>' +
        '<div class="membership-plan-days">' + plan.days + ' days of unlimited watching</div>' +
        '<div class="membership-plan-price">' + formatPrice(plan, paymentCurrency) + '</div>' +
      '</div>' +
      (buttonLabel
        ? '<button type="button" class="membership-plan-btn" data-plan-id="' + escapeHtml(plan.id) + '"' + (busy ? ' disabled' : '') + '>' + buttonLabel + '</button>'
        : '') +
    '</div>';
}

function paintMembership(){
  if(membershipState === 'loading'){
    membershipBody.innerHTML = '<div class="membership-wrap"><div class="coin-sheet-loading">' + narravaLoaderHtml('pulse') + '</div></div>';
    return;
  }
  if(membershipState === 'failed'){
    membershipBody.innerHTML =
      '<div class="discover-empty">Couldn’t load membership plans right now.<br>' +
      '<button type="button" class="pill-cta-btn" id="membershipRetryBtn">Try again</button></div>';
    document.getElementById('membershipRetryBtn').addEventListener('click', renderMembershipScreen);
    return;
  }

  const subscribed = hasActiveSubscription();
  const busy = purchaseInProgress();
  const buttonLabel = subscriptionsEnabled ? (subscribed ? 'Extend' : 'Subscribe') : null;

  let html = '<div class="membership-wrap">' + membershipStatusHtml();
  html += '<h3 class="membership-heading">' + (subscribed ? 'Extend your membership' : 'Choose a plan') + '</h3>';
  if(!subscriptionsEnabled){
    html += '<div class="coin-status warn">Subscriptions aren’t available yet.</div>';
  } else if(subscribed){
    html += '<p class="membership-note">Extra days are added after your current end date.</p>';
  }
  html += currencyToggleHtml();
  html += '<div class="membership-plans">' + membershipPlans.map(p => membershipPlanHtml(p, buttonLabel, busy)).join('') + '</div>';
  html += purchaseStatusHtml('subscription');
  html += '</div>';
  membershipBody.innerHTML = html;

  wireCurrencyToggle(membershipBody, paintMembership);
  membershipBody.querySelectorAll('[data-plan-id]').forEach(btn => {
    btn.addEventListener('click', () => startPaystackPurchase('subscription', btn.dataset.planId));
  });
}

function membershipScreenVisible(){
  return !document.getElementById('membershipScreen').classList.contains('screen-hidden');
}

// A purchase moved on, or the subscription changed (bought, expired,
// signed in/out): repaint if the screen is showing.
document.addEventListener('narrava:purchase-changed', () => {
  if(purchase && purchase.kind === 'subscription' && purchase.phase === 'done' && purchase.code === 'subscriptions_disabled') subscriptionsEnabled = false;
  if(purchase && purchase.kind === 'subscription' && purchase.phase === 'done' && purchase.code === 'unknown_plan' && membershipScreenVisible()){ renderMembershipScreen(); return; }
  if(membershipScreenVisible() && membershipState === 'ready') paintMembership();
});
document.addEventListener('narrava:coins-changed', () => {
  if(membershipScreenVisible() && membershipState === 'ready') paintMembership();
});

// Same as the browser's own Back (nav.js) — returns to where it came from.
membershipBackBtn.addEventListener('click', () => navBack());
