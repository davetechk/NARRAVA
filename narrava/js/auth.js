// auth.js
//
// Sign Up / Log In, presented as a popup over the Profile screen instead
// of replacing it. Every call here is still a direct Supabase Auth SDK
// method — no custom password handling, no custom session storage (the
// SDK's own default handles persistence). Week 1's auto-profile-creation
// trigger and RLS policies already cover what happens in the database
// once a real user exists; nothing here touches that.
//
// Sign Up while on an anonymous session UPGRADES that same account in place
// (auth.updateUser with an email + password — Supabase's supported way to
// turn an anonymous user into a permanent one), instead of calling signUp,
// which always creates a second, separate user. Same user id before and
// after, so every like, comment and bit of watch progress made while
// anonymous is still attached — nothing is copied or moved, it's the same
// row owner throughout. Log In is unchanged: it signs into a different,
// already-existing account, so there is nothing to carry over there.
//
// profile.js owns the Profile screen's menu itself (and the real logged
// state, like the wallet balance) — this file only owns the popup:
// opening/closing it, the Sign Up/Log In form and its submit handling,
// and a thin signOutUser() wrapper so profile.js's Sign Out row can reuse
// the same signOut() call without duplicating it.
//
// Forgot password, also in this popup: Log In's "Forgot password?" opens
// a request view (resetPasswordForEmail), which always shows the same
// message whether or not the email has an account. The email's link comes
// back to index.html; supabase-js signs the person in from it and fires
// PASSWORD_RECOVERY, which opens "Set a new password" (updateUser). A link
// that has expired or was already used opens a view saying so instead.

const authModalBackdrop = document.getElementById('authModalBackdrop');
const authModalBody = document.getElementById('authModalBody');
const authModalClose = document.getElementById('authModalClose');

let authMode = 'login'; // 'login' | 'signup'

// note (optional): a short line shown above the form saying why it
// opened — e.g. coins.js's "You need an account to unlock episodes."
function openAuthModal(mode, note){
  authMode = mode === 'signup' ? 'signup' : 'login';
  renderAuthForm(note);
  authModalBackdrop.classList.add('open');
}

function closeAuthModal(){
  authModalBackdrop.classList.remove('open');
  settleAuthRedirect(); // supabase-client.js: a reset link's popup is done, app.js may go on
}

authModalClose.addEventListener('click', closeAuthModal);
authModalBackdrop.addEventListener('click', e => {
  if(e.target === authModalBackdrop) closeAuthModal();
});

function renderAuthForm(noteMessage){
  const isLogin = authMode === 'login';

  authModalBody.innerHTML =
    '<div class="auth-card">' +
      '<h2 class="auth-title">' + (isLogin ? 'Log In' : 'Sign Up') + '</h2>' +
      '<div class="auth-error" id="authError"></div>' +
      '<form id="authForm" novalidate>' +
        '<label class="auth-label" for="authEmail">Email</label>' +
        '<input class="auth-input" type="email" id="authEmail" autocomplete="email" required>' +
        '<label class="auth-label" for="authPassword">Password</label>' +
        '<input class="auth-input" type="password" id="authPassword" autocomplete="' + (isLogin ? 'current-password' : 'new-password') + '" minlength="6" required>' +
        (isLogin ? '<div class="auth-forgot"><button type="button" class="auth-link" id="authForgotLink">Forgot password?</button></div>' : '') +
        '<button class="auth-submit" type="submit" id="authSubmitBtn">' + (isLogin ? 'Log In' : 'Sign Up') + '</button>' +
      '</form>' +
      '<div class="auth-switch">' +
        (isLogin ? 'Don’t have an account? ' : 'Already have an account? ') +
        '<button type="button" class="auth-link" id="authModeToggle">' + (isLogin ? 'Sign Up' : 'Log In') + '</button>' +
      '</div>' +
    '</div>';

  const errorEl = document.getElementById('authError');
  if(noteMessage){
    errorEl.textContent = noteMessage;
    errorEl.classList.add('show', 'note');
  }

  document.getElementById('authModeToggle').addEventListener('click', () => {
    authMode = isLogin ? 'signup' : 'login';
    renderAuthForm();
  });

  if(isLogin){
    document.getElementById('authForgotLink').addEventListener('click', () => {
      renderForgotPasswordForm(document.getElementById('authEmail').value.trim());
    });
  }

  document.getElementById('authForm').addEventListener('submit', handleAuthSubmit);
}

// The signed-in user IF (and only if) this browser is on a real anonymous
// session right now — i.e. someone who has been using the app as a guest.
// Null for no session at all, or for anyone already on a permanent account.
async function currentAnonymousUser(){
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if(error) throw error;
    const user = data && data.session && data.session.user;
    return (user && user.is_anonymous) ? user : null;
  } catch(err){
    console.error('Narrava: failed to check for an anonymous session before sign up', err);
    return null;
  }
}

// Turns the current anonymous account into a permanent email + password
// account, in place. Resolves to the same {data, error} shape as
// signUp/signInWithPassword so handleAuthSubmit can treat both alike;
// data.upgraded is true when this path ran.
async function upgradeAnonymousAccount(email, password){
  const { data, error } = await supabaseClient.auth.updateUser({ email, password });
  if(error) return { data: null, error };

  // The access token still carries "is_anonymous: true" until it's
  // re-issued, and row-level-security policies read the token, not the
  // local copy of the user — so fetch fresh tokens now. If this fails the
  // upgrade itself has still succeeded; the session just refreshes on its
  // own schedule.
  let session = null;
  try {
    const refreshed = await supabaseClient.auth.refreshSession();
    session = refreshed && refreshed.data && refreshed.data.session ? refreshed.data.session : null;
  } catch(err){
    console.error('Narrava: token refresh after account upgrade failed (upgrade itself succeeded)', err);
  }
  if(!session){
    const current = await supabaseClient.auth.getSession();
    session = current && current.data ? current.data.session : null;
  }
  return { data: { user: (session && session.user) || data.user, session, upgraded: true }, error: null };
}

async function handleAuthSubmit(e){
  e.preventDefault();

  const isLogin = authMode === 'login';
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errorEl = document.getElementById('authError');
  const submitBtn = document.getElementById('authSubmitBtn');

  errorEl.textContent = '';
  errorEl.classList.remove('show', 'note');
  submitBtn.disabled = true;
  submitBtn.textContent = isLogin ? 'Logging in…' : 'Signing up…';

  try {
    // Log In is untouched. Sign Up upgrades the current anonymous account in
    // place when there is one; with no anonymous session (signed out, or
    // already on a real account) it's the ordinary signUp as before.
    let result;
    if(isLogin){
      result = await supabaseClient.auth.signInWithPassword({ email, password });
    } else if(await currentAnonymousUser()){
      result = await upgradeAnonymousAccount(email, password);
    } else {
      result = await supabaseClient.auth.signUp({ email, password });
    }
    const { data, error } = result;

    if(error){
      const alreadyRegistered = !isLogin && (error.code === 'email_exists' || /already (been )?registered|already exists/i.test(error.message || ''));
      errorEl.textContent = alreadyRegistered
        ? 'An account with this email already exists — log in to it instead. (What you did as a guest on this device stays with the guest account and won’t move to that account.)'
        : error.message;
      errorEl.classList.add('show');
      submitBtn.disabled = false;
      submitBtn.textContent = isLogin ? 'Log In' : 'Sign Up';
      return;
    }

    if(!isLogin && data.upgraded && data.user && data.user.is_anonymous){
      // The project has "confirm email" on: the email is attached to this
      // same account but not yet verified, so it is still a guest account
      // until the person clicks the link. Nothing is lost meanwhile — it's
      // the same account.
      authMode = 'login';
      renderAuthForm('Almost done — check your email to confirm it. Everything you’ve done so far stays with this same account.');
      return;
    }

    if(!isLogin && !data.session){
      // Project has "confirm email" on: the account was created but
      // there's no session yet until the person clicks the email link.
      authMode = 'login';
      renderAuthForm('Account created — check your email to confirm it, then log in.');
      return;
    }

    closeAuthModal();
    renderProfileScreen(); // profile.js: re-check session, re-render the menu logged in
    refreshContinueWatchingMap().then(renderContinueWatchingBar); // app.js/discover.js: this viewer may now have real watch history
    onCoinAccountChanged(); // coins.js: this account's real balance/unlocks, plus the one-time welcome bonus
  } catch(err){
    console.error('Narrava: auth request failed', err);
    errorEl.textContent = 'Something went wrong. Please try again.';
    errorEl.classList.add('show');
    submitBtn.disabled = false;
    submitBtn.textContent = isLogin ? 'Log In' : 'Sign Up';
  }
}

// Thin wrapper so profile.js's Sign Out row can call the same signOut()
// the rest of this file uses, without owning that call itself.
async function signOutUser(){
  return await supabaseClient.auth.signOut();
}

// ---------- Forgot password ----------

// Supabase sends at most one reset email per address per 60 seconds, so
// the Send button waits that long after each request. Kept for this page
// load, so going back to Log In and returning doesn't skip it.
const RESET_EMAIL_COOLDOWN_SECONDS = 60;
let resetCooldownUntil = 0;
let resetCooldownTimer = null;

const RESET_SENT_MESSAGE = 'If an account exists for that email, we’ve sent a link to reset your password. Check your inbox and spam folder.';
const RESET_WAIT_MESSAGE = 'Please wait a minute before trying again.';
const NEW_PASSWORD_MIN_LENGTH = 6; // the same rule as Sign Up's password field

// Message line at the top of the card: kind 'note' (green) or 'error' (red).
function showAuthMessage(text, kind){
  const el = document.getElementById('authError');
  if(!el) return;
  el.textContent = text;
  el.classList.remove('note');
  el.classList.add('show');
  if(kind === 'note') el.classList.add('note');
}

function clearAuthMessage(){
  const el = document.getElementById('authError');
  if(!el) return;
  el.textContent = '';
  el.classList.remove('show', 'note');
}

// Where the email's link sends people: this app's own index.html, on
// whatever origin it's running from (localhost or the live site). The
// address must be in Supabase's Auth → URL Configuration → Redirect URLs,
// or Supabase falls back to the project's Site URL.
function passwordResetRedirectUrl(){
  return new URL('index.html', window.location.href).href;
}

function backToLogInLinkHtml(){
  return '<div class="auth-switch"><button type="button" class="auth-link" id="authBackToLogin">Back to Log In</button></div>';
}

function wireBackToLogIn(){
  document.getElementById('authBackToLogin').addEventListener('click', () => {
    authMode = 'login';
    renderAuthForm();
  });
}

function renderForgotPasswordForm(prefillEmail, message){
  authModalBody.innerHTML =
    '<div class="auth-card">' +
      '<h2 class="auth-title">Reset Password</h2>' +
      '<p class="auth-hint">Enter the email you log in with and we’ll send you a link to set a new password.</p>' +
      '<div class="auth-error" id="authError"></div>' +
      '<form id="authForgotForm" novalidate>' +
        '<label class="auth-label" for="authEmail">Email</label>' +
        '<input class="auth-input" type="email" id="authEmail" autocomplete="email" required>' +
        '<button class="auth-submit" type="submit" id="authSubmitBtn">Send reset link</button>' +
      '</form>' +
      backToLogInLinkHtml() +
    '</div>';

  document.getElementById('authEmail').value = prefillEmail || '';
  if(message) showAuthMessage(message.text, message.kind);
  wireBackToLogIn();
  document.getElementById('authForgotForm').addEventListener('submit', handleForgotPasswordSubmit);
  updateResetCooldownButton();
}

// Shows the countdown on the Send button while the cooldown runs, and puts
// the button back when it ends. Safe to call when the view isn't showing.
function updateResetCooldownButton(){
  const btn = document.getElementById('authSubmitBtn');
  const onForgotView = !!document.getElementById('authForgotForm');
  const secondsLeft = Math.ceil((resetCooldownUntil - Date.now()) / 1000);

  if(secondsLeft > 0){
    if(onForgotView && btn){
      btn.disabled = true;
      btn.textContent = 'Send again in ' + secondsLeft + 's';
    }
    if(!resetCooldownTimer) resetCooldownTimer = setInterval(updateResetCooldownButton, 1000);
    return;
  }

  if(resetCooldownTimer){ clearInterval(resetCooldownTimer); resetCooldownTimer = null; }
  if(onForgotView && btn){
    btn.disabled = false;
    btn.textContent = 'Send reset link';
  }
}

function startResetCooldown(){
  resetCooldownUntil = Date.now() + RESET_EMAIL_COOLDOWN_SECONDS * 1000;
  updateResetCooldownButton();
}

function isRateLimitError(error){
  return error.status === 429
    || /rate_limit/i.test(error.code || '')
    || /rate limit|only request this after/i.test(error.message || '');
}

async function handleForgotPasswordSubmit(e){
  e.preventDefault();
  if(Date.now() < resetCooldownUntil) return;

  const email = document.getElementById('authEmail').value.trim();
  const submitBtn = document.getElementById('authSubmitBtn');

  clearAuthMessage();
  if(!email || email.indexOf('@') === -1){
    showAuthMessage('Enter the email address you log in with.', 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending…';

  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: passwordResetRedirectUrl() });
    // Never says whether the email has an account: the same message for
    // both. Supabase itself answers the same way for an unknown email.
    if(!error){
      showAuthMessage(RESET_SENT_MESSAGE, 'note');
      startResetCooldown();
      return;
    }
    if(isRateLimitError(error)){
      showAuthMessage(RESET_WAIT_MESSAGE, 'error');
      startResetCooldown();
      return;
    }
    console.error('Narrava: password reset request failed', error);
    showAuthMessage('We couldn’t send the email just now. Please try again in a moment.', 'error');
  } catch(err){
    console.error('Narrava: password reset request failed', err);
    showAuthMessage('We couldn’t send the email just now. Please check your connection and try again.', 'error');
  }
  submitBtn.disabled = false;
  submitBtn.textContent = 'Send reset link';
}

// ---------- Arriving from the reset email ----------

let passwordRecoveryViewShown = false;

// supabase-js replaces a working link's tokens with an empty "#"; an
// expired link's error it leaves. Either way, drop what's left from the
// address in place, the same way ads.js clears "#goog_rewarded".
function clearAuthRedirectFromUrl(){
  const authParams = /access_token=|refresh_token=|error_code=|error_description=/;
  const searchHasAuth = authParams.test(window.location.search);
  if(!authParams.test(window.location.hash) && !searchHasAuth && !window.location.href.endsWith('#')) return;
  history.replaceState(history.state, '', window.location.pathname + (searchHasAuth ? '' : window.location.search));
}

function renderSetNewPasswordForm(){
  authModalBody.innerHTML =
    '<div class="auth-card">' +
      '<h2 class="auth-title">Set a New Password</h2>' +
      '<div class="auth-error" id="authError"></div>' +
      '<form id="authNewPasswordForm" novalidate>' +
        '<label class="auth-label" for="authNewPassword">New password</label>' +
        '<input class="auth-input" type="password" id="authNewPassword" autocomplete="new-password" minlength="' + NEW_PASSWORD_MIN_LENGTH + '" required>' +
        '<label class="auth-label" for="authConfirmPassword">Confirm password</label>' +
        '<input class="auth-input" type="password" id="authConfirmPassword" autocomplete="new-password" minlength="' + NEW_PASSWORD_MIN_LENGTH + '" required>' +
        '<button class="auth-submit" type="submit" id="authSubmitBtn">Save password</button>' +
      '</form>' +
    '</div>';

  document.getElementById('authNewPasswordForm').addEventListener('submit', handleSetNewPasswordSubmit);
}

function openSetNewPassword(){
  passwordRecoveryViewShown = true;
  clearAuthRedirectFromUrl();
  renderSetNewPasswordForm();
  authModalBackdrop.classList.add('open');
}

function openPasswordResetExpired(){
  passwordRecoveryViewShown = true;
  clearAuthRedirectFromUrl();
  authModalBody.innerHTML =
    '<div class="auth-card">' +
      '<h2 class="auth-title">Link Expired</h2>' +
      '<div class="auth-error show" id="authError">This reset link has expired. Request a new one.</div>' +
      '<button class="auth-submit" type="button" id="authRequestNewLink">Request a new link</button>' +
      backToLogInLinkHtml() +
    '</div>';
  document.getElementById('authRequestNewLink').addEventListener('click', () => renderForgotPasswordForm(''));
  wireBackToLogIn();
  authModalBackdrop.classList.add('open');
}

async function handleSetNewPasswordSubmit(e){
  e.preventDefault();

  const password = document.getElementById('authNewPassword').value;
  const confirmPassword = document.getElementById('authConfirmPassword').value;
  const submitBtn = document.getElementById('authSubmitBtn');

  clearAuthMessage();
  if(password.length < NEW_PASSWORD_MIN_LENGTH){
    showAuthMessage('Your password must be at least ' + NEW_PASSWORD_MIN_LENGTH + ' characters.', 'error');
    return;
  }
  if(password !== confirmPassword){
    showAuthMessage('The two passwords don’t match.', 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving…';

  try {
    const { error } = await supabaseClient.auth.updateUser({ password });
    if(error){
      console.error('Narrava: setting a new password failed', error);
      if(error.code === 'same_password'){
        showAuthMessage('That’s your current password. Choose a different one.', 'error');
      } else if(error.code === 'weak_password'){
        showAuthMessage('That password is too weak. Try a longer one.', 'error');
      } else if(error.status === 401 || error.status === 403 || error.name === 'AuthSessionMissingError'){
        openPasswordResetExpired(); // the reset session itself is gone
        return;
      } else {
        showAuthMessage('We couldn’t save your password. Please try again.', 'error');
      }
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save password';
      return;
    }

    showToast('Password updated');
    closeAuthModal();
    if(appSettings.maintenance_mode_enabled) return; // app.js now shows the maintenance screen instead
    renderProfileScreen(); // profile.js: signed in on this account now
    refreshContinueWatchingMap().then(renderContinueWatchingBar);
    onCoinAccountChanged();
  } catch(err){
    console.error('Narrava: setting a new password failed', err);
    showAuthMessage('We couldn’t save your password. Please check your connection and try again.', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save password';
  }
}

// supabase-js fires this once it has signed the person in from the link.
supabaseClient.auth.onAuthStateChange(event => {
  if(event === 'PASSWORD_RECOVERY' && !passwordRecoveryViewShown) openSetNewPassword();
});

// The page load itself: a link that didn't work (expired, already used)
// gets the expired view. A working one is normally caught by the event
// above; supabase-js fires it from a timer scheduled before initialize()
// resolves, so this later timer only acts if this file loaded too late
// to hear it.
async function handleAuthRedirectAtLoad(){
  if(!authRedirectAtLoad) return;
  let failed = authRedirectAtLoad === 'error';
  try {
    const { error } = await supabaseClient.auth.initialize();
    if(error){
      console.error('Narrava: password reset link could not be used', error);
      failed = true;
    }
  } catch(err){
    console.error('Narrava: password reset link could not be used', err);
    failed = true;
  }
  if(failed){ openPasswordResetExpired(); return; }
  setTimeout(() => { if(!passwordRecoveryViewShown) openSetNewPassword(); }, 0);
}
handleAuthRedirectAtLoad();

// Back onto the entry the reset link loaded (supabase-js's clearing of the
// tokens added an entry after it): drop the tokens from the address again.
window.addEventListener('popstate', clearAuthRedirectFromUrl);
