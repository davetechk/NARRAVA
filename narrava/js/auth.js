// Log In / Sign Up / Forgot password popup (Supabase Auth).
// Sign Up on a guest session upgrades that same account in place.

const authModalBackdrop = document.getElementById('authModalBackdrop');
const authModalBody = document.getElementById('authModalBody');
const authModalClose = document.getElementById('authModalClose');

let authMode = 'login'; // 'login' | 'signup'

// note: optional line shown above the form
function openAuthModal(mode, note){
  authMode = mode === 'signup' ? 'signup' : 'login';
  renderAuthForm(note);
  authModalBackdrop.classList.add('open');
}

function closeAuthModal(){
  authModalBackdrop.classList.remove('open');
  settleAuthRedirect(); // lets app.js go on after a reset link
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

// The current user only if it's an anonymous (guest) session
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

// Guest -> permanent account, same user id. Returns {data, error}, data.upgraded = true.
async function upgradeAnonymousAccount(email, password){
  const { data, error } = await supabaseClient.auth.updateUser({ email, password });
  if(error) return { data: null, error };

  // Refresh so the token stops saying is_anonymous (RLS reads the token)
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

// Plain text for a Supabase Auth error (never the raw message)
function authErrorText(error, isLogin){
  if(error.code === 'invalid_credentials' || /invalid login credentials/i.test(error.message || '')) return 'Wrong email or password.';
  if(error.code === 'email_not_confirmed') return 'Confirm your email first.';
  if(error.code === 'weak_password') return 'Use at least 6 characters.';
  if(error.code === 'validation_failed' || error.code === 'email_address_invalid') return 'Enter a valid email and password.';
  if(error.status === 429) return 'Too many tries. Wait a minute and try again.';
  return isLogin ? 'Couldn’t log in. Try again.' : 'Couldn’t sign up. Try again.';
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
        ? 'That email already has an account. Log in instead (your guest activity won’t move over).'
        : authErrorText(error, isLogin);
      errorEl.classList.add('show');
      submitBtn.disabled = false;
      submitBtn.textContent = isLogin ? 'Log In' : 'Sign Up';
      return;
    }

    if(!isLogin && data.upgraded && data.user && data.user.is_anonymous){
      // "Confirm email" on: still a guest until the link is clicked
      authMode = 'login';
      renderAuthForm('Almost done. Check your email to confirm it.');
      return;
    }

    if(!isLogin && !data.session){
      // "Confirm email" on: no session until the link is clicked
      authMode = 'login';
      renderAuthForm('Account created. Confirm your email, then log in.');
      return;
    }

    closeAuthModal();
    renderProfileScreen();
    refreshContinueWatchingMap().then(renderContinueWatchingBar);
    onCoinAccountChanged(); // balance, unlocks and the welcome bonus
  } catch(err){
    console.error('Narrava: auth request failed', err);
    errorEl.textContent = 'Something went wrong. Try again.';
    errorEl.classList.add('show');
    submitBtn.disabled = false;
    submitBtn.textContent = isLogin ? 'Log In' : 'Sign Up';
  }
}

// Used by profile.js's Sign Out row
async function signOutUser(){
  return await supabaseClient.auth.signOut();
}

// ---------- Forgot password ----------

// Supabase allows one reset email per address per 60s
const RESET_EMAIL_COOLDOWN_SECONDS = 60;
let resetCooldownUntil = 0;
let resetCooldownTimer = null;

const RESET_SENT_MESSAGE = 'If that email has an account, we’ve sent a reset link. Check your spam too.';
const RESET_WAIT_MESSAGE = 'Wait a minute and try again.';
const NEW_PASSWORD_MIN_LENGTH = 6; // same as Sign Up

// kind: 'note' (green) or 'error' (red)
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

// Must be listed in Supabase's Redirect URLs, or Supabase uses the Site URL
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
      '<p class="auth-hint">Enter your email to get a reset link.</p>' +
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

// Countdown on the Send button. Safe when the view isn't showing.
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
    showAuthMessage('Enter your email.', 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending…';

  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: passwordResetRedirectUrl() });
    // Same message whether or not the email has an account
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
    showAuthMessage('Couldn’t send the email. Try again soon.', 'error');
  } catch(err){
    console.error('Narrava: password reset request failed', err);
    showAuthMessage('Couldn’t send the email. Check your connection.', 'error');
  }
  submitBtn.disabled = false;
  submitBtn.textContent = 'Send reset link';
}

// ---------- Arriving from the reset email ----------

let passwordRecoveryViewShown = false;

// Drop the reset tokens / error (or a bare "#") from the URL in place
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
    showAuthMessage('Use at least ' + NEW_PASSWORD_MIN_LENGTH + ' characters.', 'error');
    return;
  }
  if(password !== confirmPassword){
    showAuthMessage('Passwords don’t match.', 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving…';

  try {
    const { error } = await supabaseClient.auth.updateUser({ password });
    if(error){
      console.error('Narrava: setting a new password failed', error);
      if(error.code === 'same_password'){
        showAuthMessage('That’s your current password. Pick a new one.', 'error');
      } else if(error.code === 'weak_password'){
        showAuthMessage('Too weak. Try a longer password.', 'error');
      } else if(error.status === 401 || error.status === 403 || error.name === 'AuthSessionMissingError'){
        openPasswordResetExpired();
        return;
      } else {
        showAuthMessage('Couldn’t save your password. Try again.', 'error');
      }
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save password';
      return;
    }

    showToast('Password updated');
    closeAuthModal();
    if(appSettings.maintenance_mode_enabled) return;
    renderProfileScreen();
    refreshContinueWatchingMap().then(renderContinueWatchingBar);
    onCoinAccountChanged();
  } catch(err){
    console.error('Narrava: setting a new password failed', err);
    showAuthMessage('Couldn’t save your password. Check your connection.', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save password';
  }
}

supabaseClient.auth.onAuthStateChange(event => {
  if(event === 'PASSWORD_RECOVERY' && !passwordRecoveryViewShown) openSetNewPassword();
});

// Expired link at load: show the expired view.
// Working link: backup in case this file loaded after PASSWORD_RECOVERY fired.
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

// Back onto the entry the link loaded: drop the tokens again
window.addEventListener('popstate', clearAuthRedirectFromUrl);
