// ads.js
//
// "Watch ads to unlock episodes": Google rewarded ads for the web (Google
// Publisher Tag), on top of the server's ad ladder. Same rule as coins.js:
// the browser only DISPLAYS what the server says and ASKS it to act. It
// never counts ads or earned episodes itself:
//
//   - status:  rpc my_ad_status() (ads_enabled, eligible, ads_today,
//              episodes_available, ads_needed_for_next, daily_limit_reached…),
//              held as-is in adState.status.
//   - reward:  rpc record_ad_view(), called ONLY from GPT's
//              rewardedSlotGranted event. The server decides whether it
//              counts (at most 30 a day, 20 s apart, real 0-coin accounts
//              without a subscription).
//   - unlock:  rpc unlock_episode_with_ad(p_episode_id), from the unlock
//              prompt (coins.js renders this file's section into it).
//
// gpt.js is loaded only when someone taps "Watch ad", never on page load.

// The rewarded ad unit. This is Google's public TEST unit, so everything can
// be built and tested before Narrava's own Google Ad Manager account is
// approved. Replace it with Narrava's real unit path once approved
// (e.g. '/<network code>/<ad unit code>') — it is the only line to change.
const NARRAVA_REWARDED_AD_UNIT = '/22639388115/rewarded_web_example';

const GPT_SRC = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
// If Google neither fills nor reports "empty" in this time, give up honestly.
const AD_LOAD_TIMEOUT_MS = 20000;

const adState = {
  status: null,     // my_ad_status()'s row, as the server sent it, or null
  phase: 'idle',    // 'idle' | 'loading' | 'showing' | 'recording' | 'unlocking'
  message: null,    // { tone: 'ok'|'warn'|'error', text } shown in the ads section
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

// my_ad_status / record_ad_view / unlock_episode_with_ad all hand back the
// fresh ad status. Accept it either nested or as the row's own columns.
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

// Whether the unlock prompt gets an ads section at all. People with coins,
// subscribers, anonymous visitors and Ad Unlock switched off: no.
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

// One rewarded ad, start to finish. Resolves with
// { outcome: 'granted'|'closed'|'no_fill'|'unsupported'|'blocked', record }
// where record is record_ad_view's row (only for 'granted').
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
        if(slot) googletag.destroySlots([slot]); // the next request starts clean
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
        // GPT returns null when this page/browser doesn't support rewarded.
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
        // The episode behind the ad stops, so the two are never heard at
        // once. It stays paused after the ad; the person resumes it.
        pauseEpisodesForAd();
        // The person already opted in by tapping "Watch ad".
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

// Mobile feed (app.js) and desktop Watch page (watch.js).
function pauseEpisodesForAd(){
  if(typeof pauseCurrentFeedEpisode === 'function') pauseCurrentFeedEpisode();
  if(typeof pauseCurrentWatchEpisode === 'function') pauseCurrentWatchEpisode();
}

// GPT leaves "#goog_rewarded" in the URL after an ad. Drop it from the
// current entry in place (no new history entry, its state kept as-is).
function clearRewardedHash(){
  if(location.hash !== '#goog_rewarded') return;
  history.replaceState(history.state, '', location.pathname + location.search);
}

// Never called except from rewardedSlotGranted.
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
  too_soon: ['warn', 'Please wait a few seconds before the next ad.'],
  daily_limit: ['warn', 'You’ve used today’s ad unlocks. Come back tomorrow, or get Nava Coins.'],
  has_coins: ['warn', 'You have Nava Coins, so ads aren’t needed to unlock episodes.'],
  subscribed: ['warn', 'You’re subscribed, so every episode is already unlocked.'],
  ads_disabled: ['warn', 'Watching ads to unlock isn’t available right now.']
};

const AD_OUTCOME_MESSAGES = {
  no_fill: 'No ad available right now, please try again later.',
  unsupported: 'Ads can’t be shown on this device or browser. Please try again later, or get Nava Coins.',
  blocked: 'The ad couldn’t load. If you use an ad blocker, pause it for Narrava, or try again later.',
  closed: 'The ad was closed before the end, so it didn’t count.'
};

// The "Watch ad" button.
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

  // The server's answer decides what happened.
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
    setAdMessage(null, null); // the section itself now says the limit is reached
  } else if(RECORD_AD_MESSAGES[status]){
    showAdOutcome(RECORD_AD_MESSAGES[status][0], RECORD_AD_MESSAGES[status][1]);
  } else {
    showAdOutcome('error', 'Couldn’t save that ad. Please try again.');
  }
}

// In the ads section if it's still shown, otherwise (the server now says
// this person isn't eligible) as a toast.
function showAdOutcome(tone, text){
  if(adsSectionVisible()) setAdMessage(tone, text);
  else { setAdMessage(null, null); showToast(text); }
}

const AD_UNLOCK_MESSAGES = {
  no_ad_unlocks: 'No ad unlocks left. Watch more ads to earn some.',
  ads_disabled: 'Watching ads to unlock isn’t available right now.',
  not_found: 'This episode isn’t available',
  no_profile: 'Your account isn’t ready yet — please try again'
};

// The "Unlock with ads" button. onSuccess(status) plays the episode the
// same way the coin unlock does.
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
  showAdOutcome(status === 'no_ad_unlocks' ? 'warn' : 'error', AD_UNLOCK_MESSAGES[status] || 'Couldn’t unlock the episode — please try again');
}

// Closing the prompt while an ad is still loading drops it, so it can't pop
// up later over whatever the person went on to do.
function cancelPendingAd(){
  if(activeAd && adState.phase === 'loading') activeAd.cancel();
}

// ---------- the ads section of the unlock prompt ----------

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
    html += '<div class="unlock-ads-note">You’ve used today’s ad unlocks. Come back tomorrow, or get Nava Coins.</div>';
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

// Called when the unlock prompt opens: the status is re-read from the
// server every time, and an old message doesn't linger. Never throws.
async function prepareAdsForPrompt(){
  if(!adFlowBusy()) adState.message = null;
  if(!coinState.isRealAccount || coinState.balance !== 0 || hasActiveSubscription()){
    adState.status = null;
    return;
  }
  await refreshAdStatus();
}
