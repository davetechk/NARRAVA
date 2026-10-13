// Watch progress and Continue Watching, plus the session helpers

// Signed-in user id (anonymous counts), or null
async function getSignedInUserId(){
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if(error) throw error;
    return (data && data.session && data.session.user) ? data.session.user.id : null;
  } catch(err){
    console.error('Narrava: failed to check auth session for watch progress', err);
    return null;
  }
}

// Real (non-anonymous) account id, or null
async function getRealAccountUserId(){
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if(error) throw error;
    const user = data && data.session && data.session.user;
    if(!user || user.is_anonymous) return null;
    return user.id;
  } catch(err){
    console.error('Narrava: failed to check real-account auth session', err);
    return null;
  }
}

// Anonymous sign-in if there's no session yet. Called once from app.js init.
async function bootstrapAnonymousSession(){
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if(error) throw error;
    if(data && data.session) return;
    const { error: signInError } = await supabaseClient.auth.signInAnonymously();
    if(signInError) throw signInError;
  } catch(err){
    console.error('Narrava: failed to bootstrap anonymous session', err);
  }
}

// 3+ seconds watched: lets the install popup offer its second chance
function markEpisodeWatchedForInstallPrompt(positionSeconds){
  if(positionSeconds < 3) return;
  if(typeof window.narravaPwaMarkWatched === 'function') window.narravaPwaMarkWatched();
}

// Upsert position. Does nothing if nobody is signed in.
async function saveWatchProgress(episodeId, seriesId, positionSeconds){
  if(!episodeId || !seriesId) return;
  markEpisodeWatchedForInstallPrompt(positionSeconds);
  // Offline: don't try
  if(appIsOffline()) return;
  const userId = await getSignedInUserId();
  if(!userId) return;

  try {
    const { error } = await supabaseClient
      .from('watch_progress')
      .upsert({
        user_id: userId,
        episode_id: episodeId,
        series_id: seriesId,
        position_seconds: Math.max(0, Math.floor(positionSeconds)),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,episode_id' });
    if(error) throw error;
  } catch(err){
    console.error('Narrava: failed to save watch progress', err);
  }
}

// Continue-watching rows, or []
async function fetchContinueWatching(){
  const userId = await getSignedInUserId();
  if(!userId) return [];

  try {
    const { data, error } = await supabaseClient.rpc('get_continue_watching');
    if(error) throw error;
    return Array.isArray(data) ? data : [];
  } catch(err){
    console.error('Narrava: failed to fetch continue watching', err);
    return [];
  }
}
