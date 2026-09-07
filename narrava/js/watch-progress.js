// watch-progress.js
//
// "Continue Watching" support: saving playback position to the existing
// watch_progress table, and reading it back via the existing
// get_continue_watching RPC. Both already exist server-side (table +
// RLS policies + function) — this file only ever calls them, it never
// touches their structure.

// Resolves to the signed-in user's id, or null if nobody is signed in.
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

// Upserts the viewer's position in one episode. Silently does nothing
// (no error surfaced to the user) if nobody is signed in, since there's
// no user_id to attach the row to.
async function saveWatchProgress(episodeId, seriesId, positionSeconds){
  if(!episodeId || !seriesId) return;
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

// Returns the signed-in viewer's continue-watching rows (via the
// existing get_continue_watching RPC), or [] if nobody is signed in or
// nobody has watched anything yet.
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
