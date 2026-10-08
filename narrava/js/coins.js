// coins.js
//
// Nava Coins — the real coin economy, replacing the old session-only
// placeholder (a hardcoded `coins = 3`, a 2-coin episode cost, episode
// ids "unlocked" in a browser-only Set, and a Pay button that just added
// coins after a timeout). Everything here only ever DISPLAYS what the
// server says and ASKS the server to act — nothing about a balance, a
// price, or an unlock is decided or stored in the browser as the source
// of truth:
//
//   - balance:  profiles.coin_balance (own row). Anonymous visitors show 0.
//   - lock:     an episode is unlocked if its number is within the series'
//               free_episode_count, Free Mode is on, my_subscription()
//               returns an active plan, or an episode_unlocks row exists
//               for it — the same rule the video signing function
//               enforces on the server. No admin exception here.
//   - unlock:   rpc unlock_episode_with_coin(p_episode_id); the balance
//               shown afterwards is the one the server returns.
//   - buying:   startPaystackPurchase — the ONE purchase flow, shared by
//               coin packs (Get Coins sheet, below) and subscriptions
//               (membership.js): Edge Function paystack-init (kind/itemId/
//               currency only), then Paystack's own inline popup. Coins and
//               subscription days are granted only by the server's webhook
//               — onSuccess is never trusted; the purchases row is polled
//               until the server says completed.
//   - subscription: my_subscription() (plan_id, plan_name, ends_at,
//               is_vip), held as-is in coinState.subscription and never
//               granted or extended here.
//   - welcome:  rpc claim_welcome_bonus(), safe to call any number of
//               times (the server only ever pays once).
//   - ads:      for a 0-coin account the server allows (my_ad_status), the
//               unlock prompt also gets ads.js's "watch ads" section.
//
// Other files read coinState / isEpisodeUnlocked and listen for the
// 'narrava:coins-changed' event (app.js, watch.js, profile.js) to
// repaint lock icons and balances whenever this state changes.

const PAYSTACK_INLINE_SRC = 'https://js.paystack.co/v2/inline.js';
const PURCHASE_POLL_MS = 2000;
const PURCHASE_POLL_LIMIT_MS = 60000;

const coinState = {
  userId: null,
  isRealAccount: false,       // signed up / logged in (not an anonymous guest)
  balance: 0,                 // last value the server reported
  unlockedEpisodeIds: new Set(), // episode_unlocks rows for this person
  serverPlayableIds: new Set(),  // episodes the unlock RPC itself answered "free" for this session (e.g. Free Mode switched on after load)
  subscription: null          // my_subscription()'s row (plan_id, plan_name, ends_at, is_vip), or null
};

// Active = the server returned a plan whose ends_at hasn't passed yet. The
// ends_at check only makes an expiry show without waiting for the next
// refresh; the server's own answer is still what's displayed.
function hasActiveSubscription(){
  const sub = coinState.subscription;
  return !!(sub && sub.plan_id && (!sub.ends_at || Date.parse(sub.ends_at) > Date.now()));
}
function isVipMember(){
  return hasActiveSubscription() && !!coinState.subscription.is_vip;
}

// ---------- loading ----------

async function currentCoinUser(){
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if(error) throw error;
    return (data && data.session && data.session.user) ? data.session.user : null;
  } catch(err){
    console.error('Narrava: failed to read the session for coins', err);
    return null;
  }
}

// RPCs returning a table come back as an array; a scalar/composite as an
// object. Both shapes are accepted.
function firstRow(data){
  return Array.isArray(data) ? (data[0] || null) : (data || null);
}

async function refreshCoinBalance(){
  if(!coinState.isRealAccount || !coinState.userId){
    coinState.balance = 0;
    renderCoinBalances();
    return;
  }
  try {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('coin_balance')
      .eq('id', coinState.userId)
      .single();
    if(error) throw error;
    coinState.balance = (data && typeof data.coin_balance === 'number') ? data.coin_balance : 0;
  } catch(err){
    // Keep the last value the server gave rather than inventing one.
    console.error('Narrava: failed to load coin balance', err);
  }
  renderCoinBalances();
}

async function refreshEntitlements(){
  if(!coinState.userId){
    coinState.unlockedEpisodeIds = new Set();
    coinState.subscription = null;
    scheduleSubscriptionExpiry();
    notifyCoinsChanged();
    return;
  }
  const [unlocks, sub] = await Promise.all([
    supabaseClient.from('episode_unlocks').select('episode_id').eq('user_id', coinState.userId),
    supabaseClient.rpc('my_subscription')
  ]);
  if(unlocks.error) console.error('Narrava: failed to load unlocked episodes', unlocks.error);
  else coinState.unlockedEpisodeIds = new Set((unlocks.data || []).map(r => r.episode_id));
  if(sub.error) console.error('Narrava: failed to load subscription', sub.error);
  else {
    const row = firstRow(sub.data);
    coinState.subscription = (row && row.plan_id) ? row : null;
  }
  scheduleSubscriptionExpiry();
  notifyCoinsChanged();
}

// When an active subscription's ends_at arrives while the app is open,
// re-ask the server, so episodes lock again without a reload. (Timers
// can't wait longer than ~24 days; a later end is caught by the next
// load/foreground refresh instead.)
let subscriptionExpiryTimer = null;
function scheduleSubscriptionExpiry(){
  if(subscriptionExpiryTimer){ clearTimeout(subscriptionExpiryTimer); subscriptionExpiryTimer = null; }
  if(!hasActiveSubscription() || !coinState.subscription.ends_at) return;
  const ms = Date.parse(coinState.subscription.ends_at) - Date.now() + 1000;
  if(ms > 0 && ms < 2147000000) subscriptionExpiryTimer = setTimeout(refreshEntitlements, ms);
}

// Full reload: who is signed in, their balance, unlocks and subscription.
// Called once at app load and whenever the account changes (sign up, log
// in, sign out).
async function refreshCoinState(){
  const user = await currentCoinUser();
  const newUserId = user ? user.id : null;
  if(newUserId !== coinState.userId) coinState.serverPlayableIds = new Set();
  coinState.userId = newUserId;
  coinState.isRealAccount = !!(user && !user.is_anonymous);
  await Promise.all([refreshCoinBalance(), refreshEntitlements()]);
}

function notifyCoinsChanged(){
  document.dispatchEvent(new CustomEvent('narrava:coins-changed'));
}

// The one lock rule, used by both players and every episode grid.
// freeEpisodeCount is the series' own free_episode_count. Free Mode is
// app.js's appSettings, read at call time. An episode downloaded to this
// device (downloads.js) is always watchable: it plays the local copy,
// with no signed URL, and stays watchable after a subscription ends —
// only NEW downloads need one, and the server decides those.
function isEpisodeUnlocked(freeEpisodeCount, ep){
  if(!ep) return false;
  if(isEpisodeDownloaded(ep.id)) return true;
  if(ep.episode_number <= (freeEpisodeCount || 0)) return true;
  if(typeof appSettings !== 'undefined' && appSettings.free_mode_enabled) return true;
  if(hasActiveSubscription()) return true;
  return coinState.unlockedEpisodeIds.has(ep.id) || coinState.serverPlayableIds.has(ep.id);
}

function coinCountLabel(n){
  return n + ' Nava Coin' + (n === 1 ? '' : 's');
}

// Every place a balance is shown: the feed's coin chip, Profile's My
// Wallet row, the Get Coins sheet and the unlock prompt.
function renderCoinBalances(){
  const chip = document.getElementById('coinBalance');
  if(chip) chip.textContent = coinState.balance;
  const wallet = document.getElementById('walletBalanceValue');
  if(wallet) wallet.textContent = coinCountLabel(coinState.balance);
  document.querySelectorAll('[data-coin-balance]').forEach(el => { el.textContent = coinCountLabel(coinState.balance); });
}

// Back in the foreground (switched apps, came back from a payment page):
// the server may have credited coins or days meanwhile, or a
// subscription may have ended.
document.addEventListener('visibilitychange', () => {
  if(!document.hidden && coinState.userId){
    refreshCoinBalance();
    refreshEntitlements();
  }
});

// ---------- welcome bonus ----------

async function claimWelcomeBonusIfEligible(){
  const user = await currentCoinUser();
  if(!user || user.is_anonymous) return; // never for anonymous visitors
  try {
    const { data, error } = await supabaseClient.rpc('claim_welcome_bonus');
    if(error) throw error;
    const row = firstRow(data);
    if(row && row.status === 'granted'){
      if(typeof row.balance === 'number' && user.id === coinState.userId){
        coinState.balance = row.balance;
        renderCoinBalances();
      }
      await refreshCoinBalance();
      showToast('Welcome! You got 5 free Nava Coins');
    }
    // Any other status: stay silent.
  } catch(err){
    console.error('Narrava: welcome bonus check failed', err);
  }
}

// Called by auth.js after a successful sign up / account link / log in,
// and by profile.js after sign out.
async function onCoinAccountChanged(){
  await refreshCoinState();
  await claimWelcomeBonusIfEligible();
}

// ---------- unlock prompt ----------

const unlockModalBackdrop = document.getElementById('unlockModalBackdrop');
const unlockModalBody = document.getElementById('unlockModalBody');
const unlockModalClose = document.getElementById('unlockModalClose');

let unlockTarget = null;   // { ep, onUnlocked }
let unlockInFlight = false;
let unlockMode = null;     // 'checking' | 'confirm' | 'insufficient'

function closeUnlockPrompt(){
  unlockModalBackdrop.classList.remove('open');
  cancelPendingAd(); // ads.js
  if(!unlockInFlight) unlockTarget = null;
}
unlockModalClose.addEventListener('click', closeUnlockPrompt);
unlockModalBackdrop.addEventListener('click', e => { if(e.target === unlockModalBackdrop) closeUnlockPrompt(); });

// The one entry point for "someone tapped a locked episode", from the
// mobile feed and the desktop watch page alike. onUnlocked runs once the
// server has said the episode is watchable — it plays it.
function openUnlockPrompt(ep, onUnlocked){
  if(!ep) return;
  if(!coinState.isRealAccount){
    openAuthModal('signup', 'You need an account to unlock episodes.');
    return;
  }
  const target = { ep, onUnlocked };
  unlockTarget = target;
  unlockModalBackdrop.classList.add('open');
  if(coinState.balance !== 0 || hasActiveSubscription()){
    renderUnlockPrompt('confirm');
    return;
  }
  // 0 coins: ask the server whether this person can watch ads (ads.js)
  // before choosing the prompt. Not eligible → the usual prompt.
  renderUnlockPrompt('checking');
  prepareAdsForPrompt().then(() => {
    if(unlockTarget !== target) return; // closed or replaced meanwhile
    renderUnlockPrompt(adsSectionVisible() ? 'insufficient' : 'confirm');
  });
}

function renderUnlockPrompt(mode){
  const ep = unlockTarget && unlockTarget.ep;
  if(!ep) return;
  unlockMode = mode;
  const balanceHtml = '<div class="coin-balance-line">Your balance: <b data-coin-balance>' + coinCountLabel(coinState.balance) + '</b></div>';

  if(mode === 'checking'){
    unlockModalBody.innerHTML =
      '<div class="auth-card unlock-card"><div class="coin-sheet-loading">' + narravaLoaderHtml('pulse') + '</div></div>';
    return;
  }

  if(mode === 'insufficient'){
    unlockModalBody.innerHTML =
      '<div class="auth-card unlock-card">' +
        '<div class="auth-title">You need 1 Nava Coin</div>' +
        '<p class="unlock-sub">Episode ' + ep.episode_number + ' costs 1 Nava Coin to unlock.</p>' +
        balanceHtml +
        '<button type="button" class="auth-submit" id="unlockGetCoinsBtn">Get Nava Coins</button>' +
        adsSectionHtml() + // ads.js — empty unless the server says this person can watch ads
        '<button type="button" class="unlock-cancel" id="unlockCancelBtn">Cancel</button>' +
      '</div>';
    document.getElementById('unlockGetCoinsBtn').addEventListener('click', () => { closeUnlockPrompt(); openCoinSheet(); });
    const target = unlockTarget;
    wireAdsSection(unlockModalBody, { ep, onUnlockSuccess: status => onEpisodeUnlocked(target, status) });
  } else {
    unlockModalBody.innerHTML =
      '<div class="auth-card unlock-card">' +
        '<div class="auth-title">Unlock this episode for 1 Nava Coin</div>' +
        '<p class="unlock-sub">Episode ' + ep.episode_number + (ep.title ? ': ' + escapeHtml(ep.title) : '') + '</p>' +
        balanceHtml +
        '<button type="button" class="auth-submit" id="unlockConfirmBtn"' + (unlockInFlight ? ' disabled' : '') + '>' + (unlockInFlight ? 'Unlocking…' : 'Unlock') + '</button>' +
        '<button type="button" class="unlock-cancel" id="unlockCancelBtn">Cancel</button>' +
      '</div>';
    document.getElementById('unlockConfirmBtn').addEventListener('click', confirmUnlock);
  }
  document.getElementById('unlockCancelBtn').addEventListener('click', closeUnlockPrompt);
}

// ads.js's status or progress changed: repaint the open prompt's ads section.
document.addEventListener('narrava:ads-changed', () => {
  if(unlockMode === 'insufficient' && unlockTarget && unlockModalBackdrop.classList.contains('open')){
    renderUnlockPrompt('insufficient');
  }
});

const UNLOCK_ERROR_MESSAGES = {
  not_signed_in: 'Please sign in to unlock episodes',
  not_found: 'This episode isn’t available',
  no_profile: 'Your account isn’t ready yet — please try again'
};

async function confirmUnlock(){
  if(unlockInFlight || !unlockTarget) return;
  const target = unlockTarget;
  unlockInFlight = true;
  const btn = document.getElementById('unlockConfirmBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Unlocking…'; }

  let row = null;
  try {
    const { data, error } = await supabaseClient.rpc('unlock_episode_with_coin', { p_episode_id: target.ep.id });
    if(error) throw error;
    row = firstRow(data);
  } catch(err){
    console.error('Narrava: unlock request failed', err);
  }
  unlockInFlight = false;

  const status = row && row.status;
  if(row && typeof row.balance === 'number'){
    coinState.balance = row.balance;
    renderCoinBalances();
  }

  if(status === 'unlocked' || status === 'already_unlocked' || status === 'free' || status === 'subscribed'){
    onEpisodeUnlocked(target, status);
    return;
  }

  if(status === 'insufficient_coins'){
    // The server says 0 coins after all: offer ads too, if it allows them.
    await prepareAdsForPrompt();
    if(unlockTarget === target) renderUnlockPrompt('insufficient');
    return;
  }

  unlockTarget = null;
  unlockModalBackdrop.classList.remove('open');
  showToast(UNLOCK_ERROR_MESSAGES[status] || 'Couldn’t unlock the episode — please try again');
}

// The server said the episode is watchable — after a coin unlock or an ad
// unlock alike. Its answer is recorded as-is; refreshEntitlements below
// reloads the subscription itself for 'subscribed'.
function onEpisodeUnlocked(target, status){
  if(status === 'unlocked' || status === 'already_unlocked') coinState.unlockedEpisodeIds.add(target.ep.id);
  else coinState.serverPlayableIds.add(target.ep.id);
  if(unlockTarget === target){
    unlockTarget = null;
    unlockModalBackdrop.classList.remove('open');
  }
  if(status === 'unlocked') showToast('Episode ' + target.ep.episode_number + ' unlocked');
  // Play first, then tell every grid to repaint its lock icons.
  if(typeof target.onUnlocked === 'function') target.onUnlocked();
  notifyCoinsChanged();
  refreshEntitlements(); // resync with the server in the background
}

// ---------- shared Paystack purchase flow ----------
//
// One flow for every purchase kind. paystack-init gets ONLY
// { kind, itemId, currency }; the server prices it. Surfaces (the Get
// Coins sheet, the Membership screen) re-render on
// 'narrava:purchase-changed' and read `purchase` to show its status.

const PURCHASE_KINDS = {
  coin_pack: {
    signUpNote: 'You need an account to buy Nava Coins.',
    completedMessage: 'Coins added'
  },
  subscription: {
    signUpNote: 'You need an account to subscribe.',
    completedMessage: 'You’re subscribed. Enjoy unlimited watching!'
  }
};

const PAYSTACK_INIT_ERRORS = {
  coin_purchases_disabled: 'Buying coins isn’t available right now',
  subscriptions_disabled: 'Subscriptions aren’t available yet.',
  unknown_pack: 'That coin pack isn’t available anymore.',
  unknown_plan: 'That plan isn’t available anymore.',
  paystack_unavailable: 'Payments are unavailable right now. Please try again later.'
};

// The one Naira / US Dollar choice, shared by Get Coins and Membership.
let paymentCurrency = 'NGN';

// null | { kind, phase:'starting'|'paying'|'confirming', reference } |
//        { kind, phase:'done', tone:'ok'|'warn'|'error', message, code }
let purchase = null;

function purchaseInProgress(){
  return !!purchase && purchase.phase !== 'done';
}

function setPurchase(state){
  purchase = state;
  document.dispatchEvent(new CustomEvent('narrava:purchase-changed'));
}

// Clears a finished result (not one in progress) — e.g. when a surface
// is reopened, so an old message doesn't linger.
function clearFinishedPurchase(){
  if(purchase && purchase.phase === 'done') setPurchase(null);
}

// Status markup for a surface: only for its own kind of purchase.
function purchaseStatusHtml(kind){
  if(!purchase || purchase.kind !== kind) return '';
  if(purchase.phase === 'starting') return '<div class="coin-status"><span class="coin-spinner"></span><span>Starting payment…</span></div>';
  if(purchase.phase === 'paying') return '<div class="coin-status"><span>Complete the payment in the Paystack window.</span></div>';
  if(purchase.phase === 'confirming') return '<div class="coin-status"><span class="coin-spinner"></span><span>Confirming your payment…</span></div>';
  return '<div class="coin-status ' + purchase.tone + '">' + escapeHtml(purchase.message) + '</div>';
}

// The Naira / US Dollar toggle with the naira note, as used by both
// surfaces. Wire it with wireCurrencyToggle(container, rerender).
function currencyToggleHtml(){
  const busy = purchaseInProgress();
  return '<div class="coin-currency">' +
      '<button type="button" class="region-btn' + (paymentCurrency === 'NGN' ? ' active' : '') + '" data-currency="NGN"' + (busy ? ' disabled' : '') + '>🇳🇬 Naira · ₦</button>' +
      '<button type="button" class="region-btn' + (paymentCurrency === 'USD' ? ' active' : '') + '" data-currency="USD"' + (busy ? ' disabled' : '') + '>🇺🇸 US Dollar · $</button>' +
      '<div class="coin-currency-note">Naira payments need a Nigerian card or bank account.</div>' +
    '</div>';
}
function wireCurrencyToggle(container, rerender){
  container.querySelectorAll('[data-currency]').forEach(btn => {
    btn.addEventListener('click', () => {
      if(purchaseInProgress()) return;
      paymentCurrency = btn.dataset.currency;
      clearFinishedPurchase();
      rerender();
    });
  });
}

// Price display from the server's own kobo/cents columns.
function formatPrice(row, currency){
  if(currency === 'USD'){
    const dollars = row.price_usd_cents / 100;
    return '$' + (Number.isInteger(dollars) ? dollars.toLocaleString('en-US') : dollars.toFixed(2));
  }
  const naira = row.price_ngn_kobo / 100;
  return '₦' + (Number.isInteger(naira) ? naira.toLocaleString('en-US') : naira.toFixed(2));
}

let paystackScriptPromise = null;
function loadPaystackScript(){
  if(window.PaystackPop) return Promise.resolve();
  if(paystackScriptPromise) return paystackScriptPromise;
  paystackScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PAYSTACK_INLINE_SRC;
    script.async = true;
    script.onload = () => window.PaystackPop ? resolve() : reject(new Error('PaystackPop missing after load'));
    script.onerror = () => reject(new Error('Paystack script failed to load'));
    document.head.appendChild(script);
  }).catch(err => { paystackScriptPromise = null; throw err; });
  return paystackScriptPromise;
}

// paystack-init's error body, whatever the transport put it in.
async function paystackInitErrorCode(error, data){
  if(data && (data.error || data.code)) return data.error || data.code;
  try {
    if(error && error.context && typeof error.context.json === 'function'){
      const body = await error.context.json();
      return (body && (body.error || body.code)) || null;
    }
  } catch(_e){ /* not JSON */ }
  return null;
}

// kind: 'coin_pack' | 'subscription'. itemId: the server's own pack/plan
// id. Returns immediately if another purchase is already running.
async function startPaystackPurchase(kind, itemId){
  if(purchaseInProgress()) return; // one payment at a time
  const cfg = PURCHASE_KINDS[kind];
  if(!cfg || !itemId) return;

  if(!coinState.isRealAccount){
    closeCoinSheet();
    openAuthModal('signup', cfg.signUpNote);
    return;
  }

  const currency = paymentCurrency;
  setPurchase({ kind, phase: 'starting' });

  let reference = null, accessCode = null, code = null;
  try {
    const { data, error } = await supabaseClient.functions.invoke('paystack-init', {
      body: { kind, itemId, currency }
    });
    if(error || !data || !data.reference || !data.accessCode){
      code = await paystackInitErrorCode(error, data);
    } else {
      reference = data.reference;
      accessCode = data.accessCode;
    }
  } catch(err){
    console.error('Narrava: paystack-init failed', err);
  }

  if(!accessCode){
    if(code === 'sign_up_required'){
      setPurchase(null);
      closeCoinSheet();
      openAuthModal('signup', cfg.signUpNote);
      return;
    }
    setPurchase({ kind, phase: 'done', tone: 'error', code, message: PAYSTACK_INIT_ERRORS[code] || 'Couldn’t start the payment. Please try again.' });
    return;
  }

  try {
    await loadPaystackScript();
  } catch(err){
    console.error('Narrava: could not load Paystack', err);
    setPurchase({ kind, phase: 'done', tone: 'error', message: 'Couldn’t open the payment window. Check your connection and try again.' });
    return;
  }

  setPurchase({ kind, phase: 'paying', reference });
  try {
    const popup = new PaystackPop();
    popup.resumeTransaction(accessCode, {
      // Not proof of payment — only the server's webhook grants anything.
      onSuccess: () => confirmPurchase(kind, reference),
      onCancel: () => { if(purchase && purchase.reference === reference) setPurchase(null); },
      onError: (err) => {
        console.error('Narrava: Paystack popup error', err);
        if(purchase && purchase.reference === reference){
          setPurchase({ kind, phase: 'done', tone: 'error', message: 'The payment window ran into a problem. You weren’t charged — please try again.' });
        }
      }
    });
  } catch(err){
    console.error('Narrava: Paystack popup failed to open', err);
    setPurchase({ kind, phase: 'done', tone: 'error', message: 'Couldn’t open the payment window. Please try again.' });
  }
}

// Polls the purchases row the webhook updates — every 2s for up to 60s.
async function confirmPurchase(kind, reference){
  const cfg = PURCHASE_KINDS[kind];
  setPurchase({ kind, phase: 'confirming', reference });
  const startedAt = Date.now();

  while(Date.now() - startedAt < PURCHASE_POLL_LIMIT_MS){
    let status = null;
    try {
      const { data, error } = await supabaseClient
        .from('purchases')
        .select('status')
        .eq('paystack_reference', reference)
        .maybeSingle();
      if(error) throw error;
      status = data ? data.status : null;
    } catch(err){
      console.error('Narrava: purchase status check failed (will retry)', err);
    }

    if(status === 'completed'){
      // Balance, unlocks and my_subscription — every lock re-checks via
      // narrava:coins-changed.
      await Promise.all([refreshCoinBalance(), refreshEntitlements()]);
      setPurchase({ kind, phase: 'done', tone: 'ok', message: cfg.completedMessage });
      showToast(cfg.completedMessage);
      return;
    }
    if(status === 'refunding' || status === 'refunded' || status === 'refund_failed'){
      setPurchase({ kind, phase: 'done', tone: 'warn', message: 'Naira payments need a Nigerian card. Your payment is being refunded.' });
      return;
    }
    if(status === 'failed'){
      setPurchase({ kind, phase: 'done', tone: 'error', message: kind === 'subscription' ? 'The payment didn’t go through. Your subscription wasn’t changed.' : 'The payment didn’t go through. No coins were added.' });
      return;
    }
    await new Promise(r => setTimeout(r, PURCHASE_POLL_MS));
  }

  setPurchase({ kind, phase: 'done', tone: 'warn', message: kind === 'subscription' ? 'Payment received, your subscription will start shortly.' : 'Payment received, your coins will appear shortly.' });
}

// ---------- Get Coins sheet ----------

const coinSheetBackdrop = document.getElementById('coinSheetBackdrop');
const coinSheetBody = document.getElementById('coinSheetBody');
const coinSheetClose = document.getElementById('coinSheetClose');

let coinPacks = [];
let coinPurchasesEnabled = false;
let coinSheetLoading = false;
let coinSheetLoadFailed = false;

function openCoinSheet(){
  clearFinishedPurchase();
  coinSheetBackdrop.classList.add('open');
  renderCoinSheet();
  loadCoinSheetData();
}
function closeCoinSheet(){
  coinSheetBackdrop.classList.remove('open');
}
coinSheetClose.addEventListener('click', closeCoinSheet);
coinSheetBackdrop.addEventListener('click', e => { if(e.target === coinSheetBackdrop) closeCoinSheet(); });

// Packs and the Coin Payments switch are re-read on every open, so a
// change in the admin panel shows up without a reload.
async function loadCoinSheetData(){
  coinSheetLoading = !coinPacks.length;
  coinSheetLoadFailed = false;
  renderCoinSheet();
  try {
    const [packs, settings] = await Promise.all([
      supabaseClient.from('coin_packs').select('id, coins, price_ngn_kobo, price_usd_cents, sort_order, active').eq('active', true).order('sort_order', { ascending: true }),
      supabaseClient.from('app_settings').select('coin_purchases_enabled').eq('id', true).single()
    ]);
    if(packs.error) throw packs.error;
    if(settings.error) throw settings.error;
    coinPacks = packs.data || [];
    coinPurchasesEnabled = !!(settings.data && settings.data.coin_purchases_enabled);
  } catch(err){
    console.error('Narrava: failed to load coin packs', err);
    coinSheetLoadFailed = !coinPacks.length;
  }
  coinSheetLoading = false;
  renderCoinSheet();
  if(coinState.userId) refreshCoinBalance();
}

const COIN_ICON_SVG = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#E8B85C"/><circle cx="12" cy="12" r="9.3" fill="none" stroke="#C99A3E" stroke-width="1.4"/><text x="12" y="16" font-size="10.5" text-anchor="middle" fill="#4a2f0d" font-family="Montserrat" font-weight="800">N</text></svg>';

function renderCoinSheet(){
  const busy = purchaseInProgress();
  let html =
    '<div class="auth-card coin-card">' +
      '<div class="auth-title">Get Nava Coins</div>' +
      '<div class="coin-balance-line">Your balance: <b data-coin-balance>' + coinCountLabel(coinState.balance) + '</b></div>';

  if(coinSheetLoading){
    html += '<div class="coin-sheet-loading">' + narravaLoaderHtml('pulse') + '</div>';
  } else if(coinSheetLoadFailed){
    html += '<div class="coin-status error">Couldn’t load coin packs. Please try again.</div>';
  } else if(!coinPurchasesEnabled){
    html += '<div class="coin-status warn">Buying coins isn’t available right now</div>';
  } else {
    html +=
      currencyToggleHtml() +
      '<div class="packages">' +
        coinPacks.map(p =>
          '<button type="button" class="pkg" data-pack-id="' + escapeHtml(p.id) + '"' + (busy ? ' disabled' : '') + '>' +
            '<div class="pkg-coins">' + COIN_ICON_SVG + p.coins + '</div>' +
            '<div class="pkg-label">Nava Coins</div>' +
            '<div class="pkg-price">' + formatPrice(p, paymentCurrency) + '</div>' +
          '</button>'
        ).join('') +
      '</div>' +
      '<div class="coin-sheet-hint">Tap a pack to pay securely with Paystack.</div>';
  }

  html += purchaseStatusHtml('coin_pack') + '</div>';
  coinSheetBody.innerHTML = html;

  wireCurrencyToggle(coinSheetBody, renderCoinSheet);
  coinSheetBody.querySelectorAll('[data-pack-id]').forEach(btn => {
    btn.addEventListener('click', () => startPaystackPurchase('coin_pack', btn.dataset.packId));
  });
}

document.addEventListener('narrava:purchase-changed', () => {
  if(purchase && purchase.kind === 'coin_pack' && purchase.phase === 'done'){
    if(purchase.code === 'coin_purchases_disabled') coinPurchasesEnabled = false;
    if(purchase.code === 'unknown_pack' && coinSheetBackdrop.classList.contains('open')) loadCoinSheetData();
  }
  renderCoinSheet();
});
