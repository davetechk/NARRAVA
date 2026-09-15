// watch-progress.js
//
// "Continue Watching" support: saving playback position to the existing
// watch_progress table, and reading it back via the existing
// get_continue_watching RPC. Both already exist server-side (table +
// RLS policies + function) — this file only ever calls them, it never
// touches their structure.

// Resolves to the signed-in user's id, or null if nobody is signed in.
// A real anonymous account (see bootstrapAnonymousSession below) counts
// as genuinely signed in here — this is the one check like/comment/reply
// and watch progress use, and none of those need a real, sign-up-backed
// account, just a real user id to attach the row to.
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

// The stronger check: null unless someone has genuinely signed up or
// logged into a real account — a real anonymous account (is_anonymous,
// a real field Supabase Auth itself sets) does not count. Save and the
// Library tab are the two real places that need this distinction;
// everywhere else (like, comment, reply, watch progress) a real
// anonymous account is genuinely signed in (see getSignedInUserId above).
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

// Called once, at real app startup (see app.js's init) — never on the
// admin pages, which must never auto-sign-in as anyone and don't load
// this file. If there's genuinely no session at all yet (a first-ever
// open, or an old session that's since expired), signs in anonymously
// via Supabase Auth's own real signInAnonymously — a genuine row in
// auth.users, not a workaround — so every visitor already has a real
// account by the time they'd ever tap like/comment/reply, before
// they've done anything. A pre-existing session (real or already
// anonymous, from an earlier visit) is left exactly as it is.
async function bootstrapAnonymousSession(){
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if(error) throw error;
    if(data && data.session) return; // already have a real session, signed up or anonymous — nothing to do
    const { error: signInError } = await supabaseClient.auth.signInAnonymously();
    if(signInError) throw signInError;
  } catch(err){
    console.error('Narrava: failed to bootstrap anonymous session', err);
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
