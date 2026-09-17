// admin-settings.js — admin/system-settings.html only.
//
// Three real controls, all reading from and writing to the one real
// app_settings row (id = true, the table's own real singleton primary
// key) — confirmed live before this was built: publicly readable
// (the real public app needs to check maintenance/free mode itself —
// see app.js), but genuinely admin-only to write (a non-admin write
// attempt returns success with zero rows affected, RLS silently
// refusing it — handled below the same way, not treated as a real
// success just because no error came back).

const APP_SETTINGS_ID = true;

let settings = { free_mode_enabled: false, maintenance_mode_enabled: false, featured_series_count: 5 };

function settingsRowsHtml(){
  return (
    '<div class="admin-settings-row">' +
      '<div class="admin-settings-row-text">' +
        '<div class="admin-row-title">Free Mode</div>' +
        '<div class="admin-row-sub">On: every series’ own real free episode count is overridden — nothing anywhere is locked. Off: every series goes back to its own real count.</div>' +
      '</div>' +
      '<button type="button" class="admin-switch' + (settings.free_mode_enabled ? ' on' : '') + '" id="freeModeSwitch" aria-label="Toggle free mode"></button>' +
    '</div>' +
    '<div class="admin-settings-row">' +
      '<div class="admin-settings-row-text">' +
        '<div class="admin-row-title">Maintenance Mode</div>' +
        '<div class="admin-row-sub">On: the real public app shows a plain "back soon" message instead of loading anything else. This admin panel always stays reachable, so it can always be turned back off.</div>' +
      '</div>' +
      '<button type="button" class="admin-switch' + (settings.maintenance_mode_enabled ? ' on' : '') + '" id="maintenanceModeSwitch" aria-label="Toggle maintenance mode"></button>' +
    '</div>' +
    '<div class="admin-settings-row">' +
      '<div class="admin-settings-row-text">' +
        '<div class="admin-row-title">Featured Series Count</div>' +
        '<div class="admin-row-sub">How many featured series the real homepage banner shows.</div>' +
      '</div>' +
      '<form id="featuredCountForm" class="admin-settings-inline-form">' +
        '<input type="number" min="0" class="auth-input admin-settings-number" id="featuredCountInput" value="' + settings.featured_series_count + '">' +
        '<button type="submit" class="admin-btn admin-btn-primary small">Save</button>' +
      '</form>' +
    '</div>'
  );
}

function renderSettings(){
  document.getElementById('settingsRows').innerHTML = settingsRowsHtml();
  wireSettings();
}

// The one real write path every control below shares. A non-admin
// account update genuinely returns {error: null, data: null} here —
// PostgREST's real shape for "RLS matched zero rows" — so that case is
// treated as a real refusal, not a silent success just because nothing
// threw.
async function updateSetting(patch){
  try {
    const { data, error } = await supabaseClient
      .from('app_settings')
      .update(patch)
      .eq('id', APP_SETTINGS_ID)
      .select('free_mode_enabled, maintenance_mode_enabled, featured_series_count')
      .single();
    if(error) throw error;
    if(!data) throw new Error('This account isn’t allowed to change settings.');
    settings = data;
    return true;
  } catch(err){
    console.error('Narrava: failed to update app_settings', err);
    showToast(err.message || 'Could not save — please try again');
    return false;
  }
}

function wireSettings(){
  document.getElementById('freeModeSwitch').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const ok = await updateSetting({ free_mode_enabled: !settings.free_mode_enabled });
    if(ok){
      renderSettings();
      showToast('Free Mode is now ' + (settings.free_mode_enabled ? 'ON — nothing is locked anywhere' : 'off — real per-series locks restored') + ' ✓');
    } else {
      btn.disabled = false;
    }
  });

  document.getElementById('maintenanceModeSwitch').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const ok = await updateSetting({ maintenance_mode_enabled: !settings.maintenance_mode_enabled });
    if(ok){
      renderSettings();
      showToast('Maintenance Mode is now ' + (settings.maintenance_mode_enabled ? 'ON — the real public app now shows the back-soon screen' : 'off — the real app is back') + ' ✓');
    } else {
      btn.disabled = false;
    }
  });

  document.getElementById('featuredCountForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('featuredCountInput');
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const raw = parseInt(input.value, 10);
    if(isNaN(raw) || raw < 0){
      showToast('Enter a real, non-negative number');
      return;
    }
    submitBtn.disabled = true;
    const ok = await updateSetting({ featured_series_count: raw });
    submitBtn.disabled = false;
    if(ok){
      renderSettings();
      showToast('Featured count updated to ' + raw + ' ✓');
    }
  });
}

(async () => {
  await requireAdminSession('system-settings');

  try {
    const { data, error } = await supabaseClient
      .from('app_settings')
      .select('free_mode_enabled, maintenance_mode_enabled, featured_series_count')
      .eq('id', APP_SETTINGS_ID)
      .single();
    if(error) throw error;
    if(data) settings = data;
  } catch(err){
    console.error('Narrava: failed to load app_settings', err);
    showToast('Could not load settings — please try again');
  }

  renderSettings();
})();
