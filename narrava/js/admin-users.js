// admin/user-management.html: rows from admin_list_users.
// Stat cards are counted here (admin_user_stats includes anonymous accounts).

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function isRealUserRow(u){
  return !!u.email;
}

// Suspended = banned_until in the future
function isSuspended(bannedUntil){
  return !!bannedUntil && new Date(bannedUntil).getTime() > Date.now();
}

function formatAdminDate(iso){
  if(!iso) return 'Never';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function userStatsRowHtml(realUsers){
  const now = Date.now();
  const totalUsers = realUsers.length;
  const newLast7Days = realUsers.filter(u => now - new Date(u.created_at).getTime() <= SEVEN_DAYS_MS).length;
  const activeLast7Days = realUsers.filter(u => u.last_sign_in_at && now - new Date(u.last_sign_in_at).getTime() <= SEVEN_DAYS_MS).length;

  return '<div class="admin-stats-row cols-3">' +
    '<div class="admin-stat-card"><div class="admin-stat-icon">' + ADMIN_ICONS.users + '</div><div class="admin-stat-body"><div class="admin-stat-label">Total Registered Users</div><div class="admin-stat-value">' + totalUsers + '</div><div class="admin-stat-caption">Registered accounts (no guests)</div></div></div>' +
    '<div class="admin-stat-card"><div class="admin-stat-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M9 12l2 2 4-4.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="admin-stat-body"><div class="admin-stat-label">New — Last 7 Days</div><div class="admin-stat-value">' + newLast7Days + '</div><div class="admin-stat-caption">Signed up this week</div></div></div>' +
    '<div class="admin-stat-card"><div class="admin-stat-icon orange"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 12h4l2 6 4-12 2 6h6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="admin-stat-body"><div class="admin-stat-label">Active — Last 7 Days</div><div class="admin-stat-value">' + activeLast7Days + '</div><div class="admin-stat-caption">Signed in this week</div></div></div>' +
  '</div>';
}

function statusBadgeHtml(suspended){
  return suspended
    ? '<span class="admin-badge red">Suspended</span>'
    : '<span class="admin-badge green">Active</span>';
}

function userRowHtml(u){
  const suspended = isSuspended(u.banned_until);
  return '<tr data-user-row="' + u.id + '">' +
    '<td><span class="admin-row-title">' + escapeHtml(u.email) + '</span></td>' +
    '<td>' + formatAdminDate(u.created_at) + '</td>' +
    '<td>' + formatAdminDate(u.last_sign_in_at) + '</td>' +
    '<td data-status-cell>' + statusBadgeHtml(suspended) + '</td>' +
    '<td data-action-cell>' +
      '<button type="button" class="admin-btn small ' + (suspended ? 'admin-btn-primary' : 'admin-btn-danger') + '" data-action="' + (suspended ? 'unsuspend' : 'suspend') + '" data-user-id="' + u.id + '" data-email="' + escapeHtml(u.email) + '">' +
        (suspended ? 'Unsuspend' : 'Suspend') +
      '</button>' +
    '</td>' +
  '</tr>';
}

// Confirm row before suspending (unsuspend needs none)
function suspendConfirmRowHtml(u){
  return '<tr data-user-row="' + u.id + '"><td colspan="5">' +
    '<div class="admin-delete-confirm">' +
      '<p>Suspend <strong>' + escapeHtml(u.email) + '</strong>? They can’t sign in until you unsuspend them. Takes effect now.</p>' +
      '<div class="auth-error" id="suspendError-' + u.id + '"></div>' +
      '<div class="admin-delete-confirm-actions">' +
        '<button type="button" class="admin-delete-confirm-btn" data-action="confirm-suspend" data-user-id="' + u.id + '" data-email="' + escapeHtml(u.email) + '">Suspend</button>' +
        '<button type="button" class="admin-delete-cancel-btn" data-action="cancel-suspend">Cancel</button>' +
      '</div>' +
    '</div>' +
  '</td></tr>';
}

let allRealUsers = [];
let confirmingSuspendId = null;

function renderStats(){
  document.getElementById('userStatsRow').innerHTML = userStatsRowHtml(allRealUsers);
}

function renderTable(){
  document.getElementById('userTableSub').textContent =
    allRealUsers.length + ' real account' + (allRealUsers.length === 1 ? '' : 's');

  if(!allRealUsers.length){
    document.getElementById('userTableWrap').innerHTML = '<div class="admin-empty">No registered accounts yet.</div>';
    return;
  }

  const rows = allRealUsers.map(u =>
    u.id === confirmingSuspendId ? suspendConfirmRowHtml(u) : userRowHtml(u)
  ).join('');

  document.getElementById('userTableWrap').innerHTML =
    '<div class="admin-table-wrap"><table class="admin-table">' +
      '<thead><tr><th>Email</th><th>Signed Up</th><th>Last Signed In</th><th>Status</th><th>Actions</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table></div>';

  wireTableActions();
}

// Calls admin-suspend-user: POST {userId, suspend}
async function callSuspendUser(userId, suspend){
  const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
  if(sessionError) throw sessionError;
  if(!sessionData || !sessionData.session || !sessionData.session.access_token){
    throw new Error('Session ended. Log in again.');
  }

  let response;
  try {
    response = await fetch(SUPABASE_URL + '/functions/v1/admin-suspend-user', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + sessionData.session.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ userId, suspend })
    });
  } catch(networkErr){
    throw new Error('Couldn’t reach the server. Check your connection.');
  }

  let body = null;
  try { body = await response.json(); } catch(_parseErr){ /* body wasn't JSON */ }

  if(!response.ok || !body || body.success !== true){
    throw new Error((body && body.error) || ('Request failed (status ' + response.status + ').'));
  }
  return body;
}

function wireTableActions(){
  const wrap = document.getElementById('userTableWrap');

  wrap.querySelectorAll('[data-action="suspend"]').forEach(btn => {
    btn.addEventListener('click', () => {
      confirmingSuspendId = btn.dataset.userId;
      renderTable();
    });
  });

  wrap.querySelectorAll('[data-action="cancel-suspend"]').forEach(btn => {
    btn.addEventListener('click', () => {
      confirmingSuspendId = null;
      renderTable();
    });
  });

  wrap.querySelectorAll('[data-action="confirm-suspend"]').forEach(btn => {
    btn.addEventListener('click', () => handleSuspendToggle(btn, true));
  });

  wrap.querySelectorAll('[data-action="unsuspend"]').forEach(btn => {
    btn.addEventListener('click', () => handleSuspendToggle(btn, false));
  });
}

async function handleSuspendToggle(btn, suspend){
  const userId = btn.dataset.userId;
  const email = btn.dataset.email;
  const errorEl = suspend ? document.getElementById('suspendError-' + userId) : null;

  btn.disabled = true;
  btn.textContent = suspend ? 'Suspending…' : 'Unsuspending…';

  try {
    await callSuspendUser(userId, suspend);

    // Update the row locally instead of reloading
    const row = allRealUsers.find(u => u.id === userId);
    if(row) row.banned_until = suspend ? new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString() : null;
    confirmingSuspendId = null;
    renderTable();
    showToast((suspend ? 'Suspended ' : 'Unsuspended ') + email + ' ✓');
  } catch(err){
    console.error('Narrava: admin-suspend-user failed', err);
    if(errorEl){
      errorEl.textContent = err.message || 'Something went wrong. Try again.';
      errorEl.classList.add('show');
      btn.disabled = false;
      btn.textContent = 'Suspend';
    } else {
      showToast(err.message || 'Couldn’t update this account. Try again.');
      btn.disabled = false;
      btn.textContent = 'Unsuspend';
    }
  }
}

(async () => {
  await requireAdminSession('user-management');

  try {
    const { data, error } = await supabaseClient.rpc('admin_list_users');
    if(error) throw error;
    allRealUsers = (data || []).filter(isRealUserRow);
    renderStats();
    renderTable();
  } catch(err){
    console.error('Narrava: failed to load admin_list_users', err);
    document.getElementById('userStatsRow').innerHTML = '';
    document.getElementById('userTableWrap').innerHTML = '<div class="admin-empty">Couldn’t load users. Try again.</div>';
    showToast('Couldn’t load users. Try again.');
  }
})();
