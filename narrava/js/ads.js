// Watch ads to unlock (Google rewarded ads). The server counts ads and unlocks;
// this file only shows its status and asks it to act. gpt.js loads on first "Watch ad".

// Google's public TEST ad unit. Swap for Narrava's real unit once approved.
const NARRAVA_REWARDED_AD_UNIT = '/22639388115/rewarded_web_example';

const GPT_SRC = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
// Give up if Google neither fills nor reports empty
const AD_LOAD_TIMEOUT_MS = 20000;

const adState = {
  status: null,     // my_ad_status() row, or null
  phase: 'idle',    // 'idle' | 'loading' | 'showing' | 'recording' | 'unlocking'
  message: null,    // { tone: 'ok'|'warn'|'error', text }
};

function adFlowBusy(){
  return adState.phase !== 'idle';
}

function notifyAdsChanged(){
  document.dispatchEvent(new CustomEvent('narrava:ads-changed'));
}

function setAdMessage(tone, text){
  adState.message = text ? { tone, text } : null;
  notifyAdsChanged();
}

// Ad status from an RPC row, nested or flat
function adStatusFromRow(row){
  if(!row) return null;
  const nested = row.ad_status || null;
  if(nested && typeof nested === 'object') return nested;
  return ('ads_today' in row || 'eligible' in row) ? row : null;
}

async function refreshAdStatus(){
  if(!coinState.isRealAccount){
    adState.status = null;
    notifyAdsChanged();
    return null;
  }
  try {
    const { data, error } = await supabaseClient.rpc('my_ad_status');
    if(error) throw error;
    adState.status = adStatusFromRow(firstRow(data));
  } catch(err){
    console.error('Narrava: failed to load ad status', err);
    adState.status = null;
  }
  notifyAdsChanged();
  return adState.status;
}

// Ads section only for signed-in 0-coin accounts without a subscription, when enabled
function adsSectionVisible(){
  const s = adState.status;
  return !!(coinState.isRealAccount && coinState.balance === 0 && !hasActiveSubscription() &&
            s && s.ads_enabled && s.eligible);
}

// ---------- Google Publisher Tag ----------

let gptScriptPromise = null;
let gptServicesEnabled = false;

function loadGpt(){
  window.googletag = window.googletag || { cmd: [] };
  if(gptScriptPromise) return gptScriptPromise;
  gptScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GPT_SRC;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('gpt.js failed to load'));
    document.head.appendChild(script);
  }).catch(err => { gptScriptPromise = null; throw err; });
  return gptScriptPromise;
}

// One rewarded ad. Resolves { outcome: 'granted'|'closed'|'no_fill'|'unsupported'|'blocked', record }
let activeAd = null; // { cancel } while an ad is loading or showing

function runRewardedAd(){
  return new Promise(resolve => {
    let slot = null, finished = false, granted = false, recordPromise = null, timer = null;
    const listeners = [];

    function finish(outcome){
      if(finished) return;
      finished = true;
      clearTimeout(timer);
      activeAd = null;
      try {
        listeners.forEach(([type, fn]) => googletag.pubads().removeEventListener(type, fn));
        if(slot) googletag.destroySlots([slot]);
      } catch(err){ console.error('Narrava: could not clean up the ad slot', err); }
      clearRewardedHash();
      Promise.resolve(recordPromise).then(record => resolve({ outcome, record: record || null }));
    }
    activeAd = { cancel: () => finish('cancelled') };

    loadGpt().catch(err => {
      console.error('Narrava: could not load Google Publisher Tag', err);
      finish('blocked');
    });

    googletag.cmd.push(() => {
      if(finished) return;
      slot = googletag.defineOutOfPageSlot(NARRAVA_REWARDED_AD_UNIT, googletag.enums.OutOfPageFormat.REWARDED);
      if(!slot){
        console.warn('Narrava: rewarded ads are not supported in this environment');
        finish('unsupported');
        return;
      }
      slot.addService(googletag.pubads());

      const on = (type, fn) => {
        const wrapped = event => { if(event.slot === slot && !finished) fn(event); };
        googletag.pubads().addEventListener(type, wrapped);
        listeners.push([type, wrapped]);
      };
      on('slotRenderEnded', event => { if(event.isEmpty) finish('no_fill'); });
      on('rewardedSlotReady', event => {
        clearTimeout(timer);
        adState.phase = 'showing';
        notifyAdsChanged();
        // Pause the episode behind the ad
        pauseEpisodesForAd();
        event.makeRewardedVisible();
      });
      on('rewardedSlotGranted', () => {
        granted = true;
        recordPromise = recordAdView();
      });
      on('rewardedSlotClosed', () => finish(granted ? 'granted' : 'closed'));

      if(!gptServicesEnabled){
        googletag.enableServices();
        gptServicesEnabled = true;
      }
      googletag.display(slot);
    });

    timer = setTimeout(() => finish('no_fill'), AD_LOAD_TIMEOUT_MS);
  });
}

function pauseEpisodesForAd(){
  if(typeof pauseCurrentFeedEpisode === 'function') pauseCurrentFeedEpisode();
  if(typeof pauseCurrentWatchEpisode === 'function') pauseCurrentWatchEpisode();
}

// Drop "#goog_rewarded" from the URL in place
function clearRewardedHash(){
  if(location.hash !== '#goog_rewarded') return;
  history.replaceState(history.state, '', location.pathname + location.search);
}

// Only from rewardedSlotGranted
async function recordAdView(){
  try {
    const { data, error } = await supabaseClient.rpc('record_ad_view');
    if(error) throw error;
    const row = firstRow(data);
    const fresh = adStatusFromRow(row);
    if(fresh) adState.status = fresh;
    return row;
  } catch(err){
    console.error('Narrava: record_ad_view failed', err);
    return null;
  }
}

const RECORD_AD_MESSAGES = {
  too_soon: ['warn', 'Wait a few seconds before the next ad.'],
  daily_limit: ['warn', 'Today’s ad unlocks are used up. Come back tomorrow or get Nava Coins.'],
  has_coins: ['warn', 'You have Nava Coins, so no ads needed.'],
  subscribed: ['warn', 'You’re subscribed. Every episode is unlocked.'],
  ads_disabled: ['warn', 'Ad unlocks aren’t available right now.']
};

const AD_OUTCOME_MESSAGES = {
  no_fill: 'No ad available. Try again later.',
  unsupported: 'Ads can’t play on this device. Try later or get Nava Coins.',
  blocked: 'The ad couldn’t load. Pause any ad blocker and try again.',
  closed: 'Ad closed early, so it didn’t count.'
};

async function watchAdForUnlock(){
  if(adFlowBusy() || !adsSectionVisible()) return;
  adState.phase = 'loading';
  setAdMessage(null, null);

  const { outcome, record } = await runRewardedAd();
  if(outcome === 'cancelled'){
    adState.phase = 'idle';
    notifyAdsChanged();
    return;
  }

  if(outcome !== 'granted'){
    adState.phase = 'idle';
    setAdMessage('warn', AD_OUTCOME_MESSAGES[outcome] || AD_OUTCOME_MESSAGES.no_fill);
    return;
  }

  adState.phase = 'recording';
  notifyAdsChanged();
  const status = record && record.status;
  if(status === 'sign_up_required' || status === 'not_signed_in'){
    adState.phase = 'idle';
    closeUnlockPrompt();
    openAuthModal('signup', 'You need an account to unlock episodes.');
    return;
  }
  await refreshAdStatus();
  adState.phase = 'idle';
  if(status === 'recorded'){
    const s = adState.status;
    setAdMessage('ok', s && s.episodes_available > 0 ? 'Ad counted. You can unlock episodes now.' : 'Ad counted.');
  } else if(status === 'daily_limit' && adsSectionVisible()){
    setAdMessage(null, null);
  } else if(RECORD_AD_MESSAGES[status]){
    showAdOutcome(RECORD_AD_MESSAGES[status][0], RECORD_AD_MESSAGES[status][1]);
  } else {
    showAdOutcome('error', 'Couldn’t save that ad. Try again.');
  }
}

// In the ads section if still shown, otherwise a toast
function showAdOutcome(tone, text){
  if(adsSectionVisible()) setAdMessage(tone, text);
  else { setAdMessage(null, null); showToast(text); }
}

const AD_UNLOCK_MESSAGES = {
  no_ad_unlocks: 'No ad unlocks left. Watch more ads to earn some.',
  ads_disabled: 'Ad unlocks aren’t available right now.',
  not_found: 'This episode isn’t available',
  no_profile: 'Your account isn’t ready yet. Try again.'
};

// "Unlock with ads" button
async function unlockEpisodeWithAd(ep, onSuccess){
  if(adFlowBusy() || !ep) return;
  adState.phase = 'unlocking';
  setAdMessage(null, null);

  let row = null;
  try {
    const { data, error } = await supabaseClient.rpc('unlock_episode_with_ad', { p_episode_id: ep.id });
    if(error) throw error;
    row = firstRow(data);
  } catch(err){
    console.error('Narrava: unlock_episode_with_ad failed', err);
  }
  const fresh = adStatusFromRow(row);
  if(fresh) adState.status = fresh;
  adState.phase = 'idle';

  const status = row && row.status;
  if(status === 'unlocked' || status === 'already_unlocked' || status === 'free' || status === 'subscribed'){
    notifyAdsChanged();
    onSuccess(status);
    return;
  }
  if(status === 'sign_up_required' || status === 'not_signed_in'){
    closeUnlockPrompt();
    openAuthModal('signup', 'You need an account to unlock episodes.');
    return;
  }
  if(!fresh) await refreshAdStatus();
  showAdOutcome(status === 'no_ad_unlocks' ? 'warn' : 'error', AD_UNLOCK_MESSAGES[status] || 'Couldn’t unlock the episode. Try again.');
}

// Closing the prompt drops an ad that's still loading
function cancelPendingAd(){
  if(activeAd && adState.phase === 'loading') activeAd.cancel();
}

// ---------- ads section of the unlock prompt ----------

function adsSectionHtml(){
  if(!adsSectionVisible()) return '';
  const s = adState.status;
  const busy = adFlowBusy();
  let html = '<div class="unlock-ads"><div class="unlock-ads-or"><span>or watch ads</span></div>';

  if(s.episodes_available > 0){
    html += '<button type="button" class="unlock-ads-btn" id="unlockWithAdBtn"' + (busy ? ' disabled' : '') + '>' +
      (adState.phase === 'unlocking' ? 'Unlocking…' : 'Unlock with ads (' + s.episodes_available + ' left today)') +
      '</button>';
  } else if(s.daily_limit_reached){
    html += '<div class="unlock-ads-note">Today’s ad unlocks are used up. Come back tomorrow or get Nava Coins.</div>';
  } else {
    const needed = s.ads_needed_for_next;
    const label = { loading: 'Loading ad…', showing: 'Ad playing…', recording: 'Saving…' }[adState.phase] || 'Watch ad';
    html +=
      '<div class="unlock-ads-goal">Watch ' + needed + ' more ad' + (needed === 1 ? '' : 's') + ' to unlock 3 episodes</div>' +
      '<div class="unlock-ads-progress">Ads watched today: ' + (s.ads_today || 0) + '</div>' +
      '<button type="button" class="unlock-ads-btn" id="unlockWatchAdBtn"' + (busy ? ' disabled' : '') + '>' +
        (busy ? '<span class="coin-spinner"></span>' : '') + label +
      '</button>';
  }

  if(adState.message){
    html += '<div class="coin-status ' + adState.message.tone + '">' + escapeHtml(adState.message.text) + '</div>';
  }
  return html + '</div>';
}

// ctx: { ep, onUnlockSuccess(status) }
function wireAdsSection(container, ctx){
  const unlockBtn = container.querySelector('#unlockWithAdBtn');
  if(unlockBtn) unlockBtn.addEventListener('click', () => unlockEpisodeWithAd(ctx.ep, ctx.onUnlockSuccess));
  const watchBtn = container.querySelector('#unlockWatchAdBtn');
  if(watchBtn) watchBtn.addEventListener('click', watchAdForUnlock);
}

// Re-reads status each time the unlock prompt opens. Never throws.
async function prepareAdsForPrompt(){
  if(!adFlowBusy()) adState.message = null;
  if(!coinState.isRealAccount || coinState.balance !== 0 || hasActiveSubscription()){
    adState.status = null;
    return;
  }
  await refreshAdStatus();
}
