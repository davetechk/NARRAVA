// profile.js
//
// The Profile screen: always renders the same menu — avatar, membership
// banner, feature row, then Top Up / My Wallet / Earn Rewards / Gifts /
// History / Download, then Language / Help & Feedback — whether or not
// anyone is signed in. Signing in happens through the popup in auth.js,
// opened from inside this screen; it no longer replaces the screen.
//
// My Wallet is the one row wired to something real: a logged-in user's
// coin_balance, read straight off their own `profiles` row (already
// covered by the existing select-own RLS policy). Every other row is
// honestly unbuilt yet — Top Up, Earn Rewards, Gifts, History, Download,
// Language and Help & Feedback all just say so via showToast (app.js).

const profilePanel = document.getElementById('profilePanel');

let currentSession = null; // Supabase session, or null when signed out
let isAdmin = false; // profiles.is_admin for the current session, false when signed out

const PROFILE_ICONS = {
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>',
  topup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 14h2"/></svg>',
  rewards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="5"/><path d="M8.5 13l-1.5 8 5-3 5 3-1.5-8"/></svg>',
  gifts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="9" width="18" height="12" rx="1"/><path d="M3 9h18M12 9v12M12 9c-2-4-7-3-7 0s5 4 7 0c2 4 7 3 7 0s-5-4-7 0z"/></svg>',
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m-4-4l4 4 4-4M4 19h16"/></svg>',
  language: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 2.5 14.3 0 18M12 3c-2.5 2.7-2.5 14.3 0 18"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 015 .5c0 1.7-2.5 1.7-2.5 3.5M12 17h.01"/></svg>',
  signout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  avatar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>',
  admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>'
};

function menuRow(id, label, icon, valueHtml){
  return '<button type="button" class="profile-row" id="' + id + '">' +
    '<span class="profile-row-icon">' + icon + '</span>' +
    '<span class="profile-row-label">' + label + '</span>' +
    (valueHtml || '') +
    '<span class="profile-row-chevron">' + PROFILE_ICONS.chevron + '</span>' +
  '</button>';
}

// Same visual row, but a plain link — the Admin Panel now lives on its
// own separate pages under admin/, not a screen inside this app.
function menuLinkRow(id, label, icon, href){
  return '<a class="profile-row" id="' + id + '" href="' + href + '">' +
    '<span class="profile-row-icon">' + icon + '</span>' +
    '<span class="profile-row-label">' + label + '</span>' +
    '<span class="profile-row-chevron">' + PROFILE_ICONS.chevron + '</span>' +
  '</a>';
}

function renderProfileMenu(){
  const loggedIn = !!currentSession;
  // Every visitor now genuinely has a session (see bootstrapAnonymousSession,
  // watch-progress.js) — a real anonymous account has no real email, so the
  // identity row specifically needs the stronger "is this a real account"
  // check, not just "is there a session at all", or it would show the
  // literal string "undefined" instead of an email for an anonymous-only
  // visitor. Wallet balance below is unaffected — a real anonymous account
  // has a real profiles row and a real coin_balance, nothing broken there.
  const isRealAccount = loggedIn && !currentSession.user.is_anonymous;

  const identityHtml = isRealAccount
    ? '<div class="profile-id"><div class="profile-email">' + escapeHtml(currentSession.user.email) + '</div></div>'
    : '<button type="button" class="profile-id profile-login-row" id="profileLoginRow">' +
        '<span>Log in</span>' + PROFILE_ICONS.chevron +
      '</button>';

  const walletValueHtml = loggedIn
    ? '<span class="profile-row-value" id="walletBalanceValue">…</span>'
    : '';

  profilePanel.innerHTML =
    '<div class="profile-header">' +
      '<div class="profile-avatar">' + PROFILE_ICONS.avatar + '</div>' +
      identityHtml +
    '</div>' +

    '<button type="button" class="profile-banner" id="membershipBanner">' +
      '<div class="profile-banner-text">' +
        '<div class="profile-banner-title">Narrava Membership</div>' +
        '<div class="profile-banner-sub">Unlock perks across the app</div>' +
      '</div>' +
      PROFILE_ICONS.chevron +
    '</button>' +

    '<div class="profile-features">' +
      '<div class="profile-feature">' + PROFILE_ICONS.rewards + '<span>Originals</span></div>' +
      '<div class="profile-feature">' + PROFILE_ICONS.topup + '<span>Daily Coins</span></div>' +
      '<div class="profile-feature">' + PROFILE_ICONS.download + '<span>Download</span></div>' +
      '<div class="profile-feature">' + PROFILE_ICONS.history + '<span>HD Quality</span></div>' +
    '</div>' +

    '<div class="profile-menu">' +
      menuRow('rowTopUp', 'Top Up', PROFILE_ICONS.topup) +
      menuRow('rowWallet', 'My Wallet', PROFILE_ICONS.wallet, walletValueHtml) +
      menuRow('rowRewards', 'Earn Rewards', PROFILE_ICONS.rewards) +
      menuRow('rowGifts', 'Gifts', PROFILE_ICONS.gifts) +
      menuRow('rowHistory', 'History', PROFILE_ICONS.history) +
      menuRow('rowDownload', 'Download', PROFILE_ICONS.download) +
    '</div>' +

    '<div class="profile-menu">' +
      menuRow('rowLanguage', 'Language', PROFILE_ICONS.language) +
      menuRow('rowHelp', 'Help & Feedback', PROFILE_ICONS.help) +
    '</div>' +

    (isAdmin
      ? '<div class="profile-menu">' + menuLinkRow('rowAdminPanel', 'Admin Panel', PROFILE_ICONS.admin, 'admin/dashboard.html') + '</div>'
      : '') +

    (loggedIn
      ? '<div class="profile-menu">' + menuRow('rowSignOut', 'Sign Out', PROFILE_ICONS.signout) + '</div>'
      : '');

  wireProfileRows(loggedIn);
  if(loggedIn) loadWalletBalance();
}

function wireProfileRows(loggedIn){
  const loginRow = document.getElementById('profileLoginRow');
  if(loginRow) loginRow.addEventListener('click', () => openAuthModal('login'));

  document.getElementById('membershipBanner').addEventListener('click', () => {
    showToast('Membership — coming soon');
  });

  document.getElementById('rowTopUp').addEventListener('click', () => {
    if(!loggedIn){ openAuthModal('login'); return; }
    showToast('Coming soon — Paystack integration is on the way');
  });

  document.getElementById('rowWallet').addEventListener('click', () => {
    if(!loggedIn) openAuthModal('login');
  });

  ['rowRewards', 'rowGifts', 'rowHistory', 'rowDownload', 'rowLanguage', 'rowHelp'].forEach(id => {
    document.getElementById(id).addEventListener('click', () => showToast('Coming soon'));
  });

  const signOutRow = document.getElementById('rowSignOut');
  if(signOutRow){
    signOutRow.addEventListener('click', async () => {
      signOutRow.disabled = true;
      const { error } = await signOutUser();

      if(error){
        console.error('Narrava: sign out failed', error);
        showToast('Could not sign out — please try again');
        signOutRow.disabled = false;
        return;
      }

      currentSession = null;
      isAdmin = false;
      renderProfileMenu();
      refreshContinueWatchingMap().then(renderContinueWatchingBar); // app.js/discover.js: nobody's signed in now, so the floating bar must go away too
    });
  }
}

// Same pattern as loadWalletBalance below: a normal select-own read on
// the current user's own profiles row, governed by the existing RLS
// policy — this only decides whether the Admin Panel row is drawn, the
// real gate is the admin-only RLS policies on series / series_genres.
async function checkIsAdmin(){
  if(!currentSession){ isAdmin = false; return; }

  try {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('is_admin')
      .eq('id', currentSession.user.id)
      .single();

    if(error) throw error;
    isAdmin = !!(data && data.is_admin);
  } catch(err){
    console.error('Narrava: failed to check admin status', err);
    isAdmin = false;
  }
}

async function loadWalletBalance(){
  const el = document.getElementById('walletBalanceValue');
  if(!el || !currentSession) return;

  try {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('coin_balance')
      .eq('id', currentSession.user.id)
      .single();

    if(error) throw error;
    el.textContent = data.coin_balance;
  } catch(err){
    console.error('Narrava: failed to load wallet balance', err);
    el.textContent = '—';
  }
}

// Entry point, called from app.js each time the Profile tab is opened.
async function renderProfileScreen(){
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if(error) throw error;
    currentSession = (data && data.session) ? data.session : null;
  } catch(err){
    console.error('Narrava: failed to check auth session', err);
    currentSession = null;
  }
  await checkIsAdmin();
  renderProfileMenu();
}
