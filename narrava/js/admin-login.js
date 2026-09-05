// admin-login.js
//
// admin/login.html only. Every other admin page redirects here whenever
// requireAdminSession() (admin-shared.js) finds no session, or a
// session that isn't an admin — so this page's own job is just: show
// the login form, or if already signed in, decide which of the two
// gates applies and show that instead of the form.

const adminLoginView = document.getElementById('adminLoginView');
const adminDeniedView = document.getElementById('adminDeniedView');

function showLoginView(){
  adminLoginView.classList.remove('screen-hidden');
  adminDeniedView.classList.add('screen-hidden');
}
function showDeniedView(){
  adminLoginView.classList.add('screen-hidden');
  adminDeniedView.classList.remove('screen-hidden');
}

async function checkIsAdmin(userId){
  try {
    const { data, error } = await supabaseClient.from('profiles').select('is_admin').eq('id', userId).single();
    if(error) throw error;
    return !!(data && data.is_admin);
  } catch(err){
    console.error('Narrava: failed to check admin status', err);
    return false;
  }
}

async function afterAuthResolved(session){
  const admin = await checkIsAdmin(session.user.id);
  if(admin){
    window.location.href = 'dashboard.html';
  } else {
    showDeniedView();
  }
}

async function initLoginPage(){
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if(error) throw error;
    const session = data && data.session;
    if(!session){ showLoginView(); return; }
    await afterAuthResolved(session);
  } catch(err){
    console.error('Narrava: failed to check auth session', err);
    showLoginView();
  }
}

async function handleAdminLoginSubmit(e){
  e.preventDefault();

  const email = document.getElementById('adminLoginEmail').value.trim();
  const password = document.getElementById('adminLoginPassword').value;
  const errorEl = document.getElementById('adminLoginError');
  const submitBtn = document.getElementById('adminLoginSubmit');

  errorEl.textContent = '';
  errorEl.classList.remove('show');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Logging in…';

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if(error){
      errorEl.textContent = error.message;
      errorEl.classList.add('show');
      return;
    }
    submitBtn.textContent = 'Checking admin access…';
    await afterAuthResolved(data.session);
  } catch(err){
    console.error('Narrava: admin login failed', err);
    errorEl.textContent = 'Something went wrong. Please try again.';
    errorEl.classList.add('show');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Log In';
  }
}

async function handleDeniedSignOut(){
  try {
    const { error } = await supabaseClient.auth.signOut();
    if(error) throw error;
  } catch(err){
    console.error('Narrava: sign out failed', err);
    showToast('Could not sign out — please try again');
    return;
  }
  document.getElementById('adminLoginEmail').value = '';
  document.getElementById('adminLoginPassword').value = '';
  showLoginView();
}

document.getElementById('adminLoginForm').addEventListener('submit', handleAdminLoginSubmit);
document.getElementById('adminDeniedSignOut').addEventListener('click', handleDeniedSignOut);

initLoginPage();
