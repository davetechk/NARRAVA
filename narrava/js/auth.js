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

const authModalBackdrop = document.getElementById('authModalBackdrop');
const authModalBody = document.getElementById('authModalBody');
const authModalClose = document.getElementById('authModalClose');

let authMode = 'login'; // 'login' | 'signup'

function openAuthModal(mode){
  authMode = mode === 'signup' ? 'signup' : 'login';
  renderAuthForm();
  authModalBackdrop.classList.add('open');
}

function closeAuthModal(){
  authModalBackdrop.classList.remove('open');
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
