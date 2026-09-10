// auth.js
//
// Sign Up / Log In, presented as a popup over the Profile screen instead
// of replacing it. Every call here is still a direct Supabase Auth SDK
// method — no custom password handling, no custom session storage (the
// SDK's own default handles persistence). Week 1's auto-profile-creation
// trigger and RLS policies already cover what happens in the database
// once a real user exists; nothing here touches that.
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
    const { data, error } = isLogin
      ? await supabaseClient.auth.signInWithPassword({ email, password })
      : await supabaseClient.auth.signUp({ email, password });

    if(error){
      errorEl.textContent = error.message;
      errorEl.classList.add('show');
      submitBtn.disabled = false;
      submitBtn.textContent = isLogin ? 'Log In' : 'Sign Up';
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
