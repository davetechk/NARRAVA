// Profile screen menu (the same whether or not anyone is signed in)

const profilePanel = document.getElementById('profilePanel');

let currentSession = null; // null when signed out
let isAdmin = false; // profiles.is_admin for the current session, false when signed out
let currentDisplayName = null; // profiles.display_name, null until loaded or if not set

const usernameModalBackdrop = document.getElementById('usernameModalBackdrop');
const usernameModalClose = document.getElementById('usernameModalClose');
const usernameForm = document.getElementById('usernameForm');
const usernameInput = document.getElementById('usernameInput');
const usernameError = document.getElementById('usernameError');
const usernameSubmitBtn = document.getElementById('usernameSubmitBtn');

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
  admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>',
  username: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>'
};

function menuRow(id, label, icon, valueHtml){
  return '<button type="button" class="profile-row" id="' + id + '">' +
    '<span class="profile-row-icon">' + icon + '</span>' +
    '<span class="profile-row-label">' + label + '</span>' +
    (valueHtml || '') +
    '<span class="profile-row-chevron">' + PROFILE_ICONS.chevron + '</span>' +
  '</button>';
}

// Link row (Admin Panel)
function menuLinkRow(id, label, icon, href){
  return '<a class="profile-row" id="' + id + '" href="' + href + '">' +
    '<span class="profile-row-icon">' + icon + '</span>' +
    '<span class="profile-row-label">' + label + '</span>' +
    '<span class="profile-row-chevron">' + PROFILE_ICONS.chevron + '</span>' +
  '</a>';
}

function renderProfileMenu(){
  const loggedIn = !!currentSession;
  // Guests have a session but no email
  const isRealAccount = loggedIn && !currentSession.user.is_anonymous;

  // Username if set, else email. VIP badge sits beside the name.
  const identityHtml = isRealAccount
    ? '<div class="profile-id"><div class="profile-email" id="profileIdentityValue">' + escapeHtml(currentDisplayName || currentSession.user.email) + '</div>' +
        '<span class="vip-badge" id="profileVipBadge"' + (isVipMember() ? '' : ' hidden') + '>VIP</span></div>'
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
      pwaInstallButtonHtml() +
    '</div>' +

    '<button type="button" class="profile-banner" id="membershipBanner">' +
      '<div class="profile-banner-text">' +
        '<div class="profile-banner-title">Narrava Membership</div>' +
        '<div class="profile-banner-sub">Unlock perks across the app</div>' +
      '</div>' +
      PROFILE_ICONS.chevron +
    '</button>' +

    (loggedIn
      ? '<div class="profile-menu">' + menuRow('rowUsername', 'Username', PROFILE_ICONS.username, '<span class="profile-row-value" id="usernameValue">…</span>') + '</div>'
      : '') +

    '<div class="profile-features">' +
      '<button type="button" class="profile-feature" id="featureOriginals">' + PROFILE_ICONS.rewards + '<span>Originals</span></button>' +
      '<button type="button" class="profile-feature" id="featureDailyCoins">' + PROFILE_ICONS.topup + '<span>Daily Coins</span></button>' +
      '<button type="button" class="profile-feature" id="featureDownload">' + PROFILE_ICONS.download + '<span>Download</span></button>' +
      '<button type="button" class="profile-feature" id="featureHdQuality">' + PROFILE_ICONS.history + '<span>HD Quality</span></button>' +
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

// Install help button (pwa-install.js decides what it shows)
function pwaInstallButtonHtml(){
  return '<button type="button" class="profile-install-btn" id="profileInstallBtn">' +
    PROFILE_ICONS.download + '<span>How to install</span></button>';
}

function wireProfileRows(loggedIn){
  const installBtn = document.getElementById('profileInstallBtn');
  if(installBtn) installBtn.addEventListener('click', () => {
    if(typeof window.narravaPwaShowInstallHelp === 'function') window.narravaPwaShowInstallHelp();
  });

  const loginRow = document.getElementById('profileLoginRow');
  if(loginRow) loginRow.addEventListener('click', () => openAuthModal('login'));

  document.getElementById('membershipBanner').addEventListener('click', () => openMembershipScreen());

  // Not built yet
  ['rowRewards', 'rowGifts',
   'featureOriginals', 'featureDailyCoins', 'featureHdQuality'].forEach(id => {
    document.getElementById(id).addEventListener('click', () => showToast('Coming soon'));
  });

  document.getElementById('rowDownload').addEventListener('click', openDownloadsFromProfile);
  document.getElementById('featureDownload').addEventListener('click', openDownloadsFromProfile);

  document.getElementById('rowHistory').addEventListener('click', () => {
    showScreen('history');
    renderHistoryScreen();
  });

  document.getElementById('rowTopUp').addEventListener('click', () => openCoinSheet());
  document.getElementById('rowWallet').addEventListener('click', () => openCoinSheet());

  const usernameRow = document.getElementById('rowUsername');
  if(usernameRow) usernameRow.addEventListener('click', openUsernameModal);

  document.getElementById('rowHelp').addEventListener('click', () => showScreen('help'));

  document.getElementById('rowLanguage').addEventListener('click', () => showToast('Coming soon'));

  const signOutRow = document.getElementById('rowSignOut');
  if(signOutRow){
    signOutRow.addEventListener('click', async () => {
      signOutRow.disabled = true;
      const { error } = await signOutUser();

      if(error){
        console.error('Narrava: sign out failed', error);
        showToast('Couldn’t sign out. Try again.');
        signOutRow.disabled = false;
        return;
      }

      currentSession = null;
      isAdmin = false;
      currentDisplayName = null;
      renderProfileMenu();
      onCoinAccountChanged();
      refreshContinueWatchingMap().then(renderContinueWatchingBar); // hide the Continue Watching bar
    });
  }
}

// Loads is_admin and the username before the menu renders
async function checkIsAdmin(){
  if(!currentSession){ isAdmin = false; currentDisplayName = null; return; }

  try {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('is_admin, display_name')
      .eq('id', currentSession.user.id)
      .single();

    if(error) throw error;
    isAdmin = !!(data && data.is_admin);
    currentDisplayName = (data && data.display_name && data.display_name.trim()) ? data.display_name.trim() : null;
  } catch(err){
    console.error('Narrava: failed to check admin status', err);
    isAdmin = false;
    currentDisplayName = null;
  }
}

async function loadWalletBalance(){
  const walletEl = document.getElementById('walletBalanceValue');
  const usernameEl = document.getElementById('usernameValue');
  if(usernameEl) usernameEl.textContent = currentDisplayName || 'Not set';
  if(!currentSession || !walletEl) return;

  // Last known balance now, then re-read
  renderCoinBalances();
  await refreshCoinBalance();
}

// Username popup (display_name is the only column users can update)
function openUsernameModal(){
  usernameError.textContent = '';
  usernameError.classList.remove('show');
  usernameInput.value = currentDisplayName || '';
  usernameModalBackdrop.classList.add('open');
  setTimeout(() => usernameInput.focus(), 150);
}
function closeUsernameModal(){
  usernameModalBackdrop.classList.remove('open');
}
usernameModalClose.addEventListener('click', closeUsernameModal);
usernameModalBackdrop.addEventListener('click', e => { if(e.target === usernameModalBackdrop) closeUsernameModal(); });

usernameForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if(!currentSession) return;

  const name = usernameInput.value.trim();
  usernameError.textContent = '';
  usernameError.classList.remove('show');
  usernameSubmitBtn.disabled = true;
  usernameSubmitBtn.textContent = 'Saving…';

  try {
    const { error } = await supabaseClient
      .from('profiles')
      .update({ display_name: name || null })
      .eq('id', currentSession.user.id);
    if(error) throw error;

    currentDisplayName = name || null;
    const usernameEl = document.getElementById('usernameValue');
    if(usernameEl) usernameEl.textContent = currentDisplayName || 'Not set';
    // Update the identity row live
    const identityEl = document.getElementById('profileIdentityValue');
    if(identityEl) identityEl.textContent = currentDisplayName || currentSession.user.email;
    closeUsernameModal();
    showToast('Username updated ✓');
  } catch(err){
    console.error('Narrava: failed to update username', err);
    usernameError.textContent = 'Couldn’t save. Try again.';
    usernameError.classList.add('show');
  } finally {
    usernameSubmitBtn.disabled = false;
    usernameSubmitBtn.textContent = 'Save';
  }
});

// Show or hide the VIP badge
document.addEventListener('narrava:coins-changed', () => {
  const badge = document.getElementById('profileVipBadge');
  if(badge) badge.hidden = !isVipMember();
});

// Called each time the Profile tab opens
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
