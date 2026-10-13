// admin/system-settings.html: the app_settings row

const APP_SETTINGS_ID = true;

let settings = {
  free_mode_enabled: false, maintenance_mode_enabled: false, featured_series_count: 5,
  ad_unlock_enabled: false, subscriptions_enabled: false, coin_purchases_enabled: false,
  vip_section_enabled: false
};

const SETTINGS_COLUMNS = 'free_mode_enabled, maintenance_mode_enabled, featured_series_count, ad_unlock_enabled, subscriptions_enabled, coin_purchases_enabled, vip_section_enabled';

function settingsRowsHtml(){
  return (
    '<div class="admin-settings-row">' +
      '<div class="admin-settings-row-text">' +
        '<div class="admin-row-title">Free Mode</div>' +
        '<div class="admin-row-sub">On: every episode is free. Off: each series uses its own free episode count.</div>' +
      '</div>' +
      '<button type="button" class="admin-switch' + (settings.free_mode_enabled ? ' on' : '') + '" id="freeModeSwitch" aria-label="Toggle free mode"></button>' +
    '</div>' +
    '<div class="admin-settings-row">' +
      '<div class="admin-settings-row-text">' +
        '<div class="admin-row-title">Maintenance Mode</div>' +
        '<div class="admin-row-sub">On: the app shows a "back soon" screen. The admin panel stays reachable.</div>' +
      '</div>' +
      '<button type="button" class="admin-switch' + (settings.maintenance_mode_enabled ? ' on' : '') + '" id="maintenanceModeSwitch" aria-label="Toggle maintenance mode"></button>' +
    '</div>' +
    '<div class="admin-settings-row">' +
      '<div class="admin-settings-row-text">' +
        '<div class="admin-row-title">Featured Series Count</div>' +
        '<div class="admin-row-sub">How many featured series the home banner shows.</div>' +
      '</div>' +
      '<form id="featuredCountForm" class="admin-settings-inline-form">' +
        '<input type="number" min="0" class="auth-input admin-settings-number" id="featuredCountInput" value="' + settings.featured_series_count + '">' +
        '<button type="submit" class="admin-btn admin-btn-primary small">Save</button>' +
      '</form>' +
    '</div>' +
    '<div class="admin-settings-row">' +
      '<div class="admin-settings-row-text">' +
        '<div class="admin-row-title">Ad Unlock</div>' +
        '<div class="admin-row-sub">Lets viewers watch ads to unlock episodes. Takes effect once this feature launches.</div>' +
      '</div>' +
      '<button type="button" class="admin-switch' + (settings.ad_unlock_enabled ? ' on' : '') + '" id="adUnlockSwitch" aria-label="Toggle ad unlock"></button>' +
    '</div>' +
    '<div class="admin-settings-row">' +
      '<div class="admin-settings-row-text">' +
        '<div class="admin-row-title">Subscription Payments</div>' +
        '<div class="admin-row-sub">Lets viewers pay for a subscription to unlock episodes. Takes effect once this feature launches.</div>' +
      '</div>' +
      '<button type="button" class="admin-switch' + (settings.subscriptions_enabled ? ' on' : '') + '" id="subscriptionsSwitch" aria-label="Toggle subscription payments"></button>' +
    '</div>' +
    '<div class="admin-settings-row">' +
      '<div class="admin-settings-row-text">' +
        '<div class="admin-row-title">Coin Payments</div>' +
        '<div class="admin-row-sub">Lets viewers buy coins to unlock episodes. Takes effect once this feature launches.</div>' +
      '</div>' +
      '<button type="button" class="admin-switch' + (settings.coin_purchases_enabled ? ' on' : '') + '" id="coinPurchasesSwitch" aria-label="Toggle coin payments"></button>' +
    '</div>' +
    '<div class="admin-settings-row">' +
      '<div class="admin-settings-row-text">' +
        '<div class="admin-row-title">VIP Section</div>' +
        '<div class="admin-row-sub">Shows the VIP tab in the app. Perks for yearly members will be added once agreed.</div>' +
      '</div>' +
      '<button type="button" class="admin-switch' + (settings.vip_section_enabled ? ' on' : '') + '" id="vipSectionSwitch" aria-label="Toggle VIP section"></button>' +
    '</div>'
  );
}

function renderSettings(){
  document.getElementById('settingsRows').innerHTML = settingsRowsHtml();
  wireSettings();
}

// RLS refusal comes back as no error and no data, so treat that as a failure
async function updateSetting(patch){
  try {
    const { data, error } = await supabaseClient
      .from('app_settings')
      .update(patch)
      .eq('id', APP_SETTINGS_ID)
      .select(SETTINGS_COLUMNS)
      .single();
    if(error) throw error;
    if(!data) throw new Error('This account isn’t allowed to change settings.');
    settings = data;
    return true;
  } catch(err){
    console.error('Narrava: failed to update app_settings', err);
    showToast(err.message || 'Couldn’t save. Try again.');
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
      showToast('Free Mode is now ' + (settings.free_mode_enabled ? 'ON (everything free)' : 'off') + ' ✓');
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
      showToast('Maintenance Mode is now ' + (settings.maintenance_mode_enabled ? 'ON (app shows the back-soon screen)' : 'off') + ' ✓');
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
      showToast('Enter 0 or more');
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

  document.getElementById('adUnlockSwitch').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const ok = await updateSetting({ ad_unlock_enabled: !settings.ad_unlock_enabled });
    if(ok){
      renderSettings();
      showToast('Ad Unlock is now ' + (settings.ad_unlock_enabled ? 'ON' : 'off') + ' ✓');
    } else {
      btn.disabled = false;
    }
  });

  document.getElementById('subscriptionsSwitch').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const ok = await updateSetting({ subscriptions_enabled: !settings.subscriptions_enabled });
    if(ok){
      renderSettings();
      showToast('Subscription Payments is now ' + (settings.subscriptions_enabled ? 'ON' : 'off') + ' ✓');
    } else {
      btn.disabled = false;
    }
  });

  document.getElementById('coinPurchasesSwitch').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const ok = await updateSetting({ coin_purchases_enabled: !settings.coin_purchases_enabled });
    if(ok){
      renderSettings();
      showToast('Coin Payments is now ' + (settings.coin_purchases_enabled ? 'ON' : 'off') + ' ✓');
    } else {
      btn.disabled = false;
    }
  });

  document.getElementById('vipSectionSwitch').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const ok = await updateSetting({ vip_section_enabled: !settings.vip_section_enabled });
    if(ok){
      renderSettings();
      showToast('VIP Section is now ' + (settings.vip_section_enabled ? 'ON' : 'off') + ' ✓');
    } else {
      btn.disabled = false;
    }
  });
}

(async () => {
  await requireAdminSession('system-settings');

  try {
    const { data, error } = await supabaseClient
      .from('app_settings')
      .select(SETTINGS_COLUMNS)
      .eq('id', APP_SETTINGS_ID)
      .single();
    if(error) throw error;
    if(data) settings = data;
  } catch(err){
    console.error('Narrava: failed to load app_settings', err);
    showToast('Couldn’t load settings. Try again.');
  }

  renderSettings();
})();
