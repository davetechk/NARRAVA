// social.js
//
// Real like, save, and comments for a series — series_likes,
// series_saves, series_comments, comment_likes, and the two existing
// RPCs (get_series_like_count, get_series_comments). All five already
// exist server-side (tables + RLS + both functions) — this file only
// ever calls them, never touches their structure. getSignedInUserId
// comes from watch-progress.js (a general "who's signed in, if anyone"
// helper, not actually video-specific despite where it lives).
//
// Every write helper below does its own sign-in check and opens the
// same sign-in modal every other account-gated action in this app
// already uses (openAuthModal, auth.js) rather than failing silently —
// resolving to null in that case, which callers treat as "no change,
// don't touch the UI as if it succeeded."

// ================= Series like/save =================

async function fetchSeriesLikeCount(seriesId){
  try {
    const { data, error } = await supabaseClient.rpc('get_series_like_count', { p_series_id: seriesId });
    if(error) throw error;
    return typeof data === 'number' ? data : 0;
  } catch(err){
    console.error('Narrava: failed to fetch series like count', err);
    return 0;
  }
}

// Real select-own-row reads — series_likes/series_saves have no RPC of
// their own, so this is a normal scoped read against the existing
// table/RLS, same as every other "does this row exist for me" check
// elsewhere in this app.
async function fetchMySeriesLikeSaveState(seriesId, userId){
  if(!userId) return { liked: false, saved: false };
  try {
    const [likeResult, saveResult] = await Promise.all([
      supabaseClient.from('series_likes').select('series_id').eq('series_id', seriesId).eq('user_id', userId).maybeSingle(),
      supabaseClient.from('series_saves').select('series_id').eq('series_id', seriesId).eq('user_id', userId).maybeSingle()
    ]);
    if(likeResult.error) throw likeResult.error;
    if(saveResult.error) throw saveResult.error;
    return { liked: !!likeResult.data, saved: !!saveResult.data };
  } catch(err){
    console.error('Narrava: failed to fetch my like/save state', err);
    return { liked: false, saved: false };
  }
}

// Fetches the real count + this viewer's own liked/saved state together
// — one place both app.js (mobile feed) and watch.js (desktop) call
// whenever a series becomes the current one, rather than two separate
// implementations of the same real lookup.
async function fetchSeriesSocialState(seriesId){
  const userId = await getSignedInUserId();
  const [likeCount, myState] = await Promise.all([
    fetchSeriesLikeCount(seriesId),
    fetchMySeriesLikeSaveState(seriesId, userId)
  ]);
  return { likeCount, liked: myState.liked, saved: myState.saved };
}

// Toggles a real row in series_likes for the signed-in viewer. Returns
// the new liked state (true/false) on success, or null if nothing
// happened (not signed in — the sign-in modal was opened instead — or
// the write failed), so callers know not to update the button as if it
// worked.
async function toggleSeriesLike(seriesId, currentlyLiked){
  const userId = await getSignedInUserId();
  if(!userId){ openAuthModal('login'); return null; }

  try {
    if(currentlyLiked){
      const { error } = await supabaseClient.from('series_likes').delete().eq('series_id', seriesId).eq('user_id', userId);
      if(error) throw error;
      return false;
    }
    const { error } = await supabaseClient.from('series_likes').upsert(
      { series_id: seriesId, user_id: userId },
      { onConflict: 'user_id,series_id' }
    );
    if(error) throw error;
    return true;
  } catch(err){
    console.error('Narrava: failed to toggle series like', err);
    showToast('Could not update like — please try again');
    return null;
  }
}

// Same shape as toggleSeriesLike, against series_saves — personal only,
// no public count (never asked for, saves don't need one).
async function toggleSeriesSave(seriesId, currentlySaved){
  const userId = await getSignedInUserId();
  if(!userId){ openAuthModal('login'); return null; }

  try {
    if(currentlySaved){
      const { error } = await supabaseClient.from('series_saves').delete().eq('series_id', seriesId).eq('user_id', userId);
      if(error) throw error;
      return false;
    }
    const { error } = await supabaseClient.from('series_saves').upsert(
      { series_id: seriesId, user_id: userId },
      { onConflict: 'user_id,series_id' }
    );
    if(error) throw error;
    return true;
  } catch(err){
    console.error('Narrava: failed to toggle series save', err);
    showToast('Could not update save — please try again');
    return null;
  }
}

// ================= Comments =================

// The one real way to read a series' comments — every top-level
// comment and reply together, each with a real like_count and whether
// the signed-in viewer (if any) has liked it. Works signed out too
// (get_series_comments itself handles that — confirmed live).
async function fetchSeriesComments(seriesId){
  try {
    const { data, error } = await supabaseClient.rpc('get_series_comments', { p_series_id: seriesId });
    if(error) throw error;
    return Array.isArray(data) ? data : [];
  } catch(err){
    console.error('Narrava: failed to fetch series comments', err);
    return [];
  }
}

// Posts a real comment or reply (parentCommentId null/omitted for a
// top-level comment). Returns true on success, null if nothing
// happened (signed out — sign-in modal opened instead — or empty body,
// or the write failed).
async function postSeriesComment(seriesId, body, parentCommentId){
  const trimmed = (body || '').trim();
  if(!trimmed) return null;

  const userId = await getSignedInUserId();
  if(!userId){ openAuthModal('login'); return null; }

  try {
    const { error } = await supabaseClient.from('series_comments').insert({
      series_id: seriesId,
      user_id: userId,
      body: trimmed,
      parent_comment_id: parentCommentId || null
    });
    if(error) throw error;
    return true;
  } catch(err){
    console.error('Narrava: failed to post comment', err);
    showToast('Could not post comment — please try again');
    return null;
  }
}

// Deletes a comment — the RLS policy already in place decides whether
// this specific viewer is actually allowed to (its own comment, or any
// comment if they're an admin); this never re-implements that check,
// it just attempts the delete and reports what really happened.
// Deleting a comment with real replies removes those too — a database
// cascade, confirmed live, not something this function does itself.
async function deleteSeriesComment(commentId){
  try {
    const { error } = await supabaseClient.from('series_comments').delete().eq('id', commentId);
    if(error) throw error;
    return true;
  } catch(err){
    console.error('Narrava: failed to delete comment', err);
    showToast('Could not delete comment — please try again');
    return false;
  }
}

// Real like/unlike on one specific comment — comment_likes, entirely
// separate from the series' own like button. Same null-means-"prompted
// sign-in-or-failed" contract as toggleSeriesLike/toggleSeriesSave.
async function toggleCommentLike(commentId, currentlyLiked){
  const userId = await getSignedInUserId();
  if(!userId){ openAuthModal('login'); return null; }

  try {
    if(currentlyLiked){
      const { error } = await supabaseClient.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', userId);
      if(error) throw error;
      return false;
    }
    const { error } = await supabaseClient.from('comment_likes').upsert(
      { comment_id: commentId, user_id: userId },
      { onConflict: 'user_id,comment_id' }
    );
    if(error) throw error;
    return true;
  } catch(err){
    console.error('Narrava: failed to toggle comment like', err);
    showToast('Could not update like — please try again');
    return null;
  }
}

// Real moderation gate for the UI only (whether to even show an admin
// "delete" affordance on someone else's comment) — the actual authority
// is the RLS policy on series_comments itself, checked fresh each time
// rather than trusting a possibly-stale flag from elsewhere in the app
// (profile.js's own isAdmin is only refreshed when the Profile tab is
// opened, which has nothing to do with when a comment panel opens).
async function isCurrentUserAdmin(){
  const userId = await getSignedInUserId();
  if(!userId) return false;
  try {
    const { data, error } = await supabaseClient.from('profiles').select('is_admin').eq('id', userId).single();
    if(error) throw error;
    return !!(data && data.is_admin);
  } catch(err){
    console.error('Narrava: failed to check admin status for comment moderation', err);
    return false;
  }
}
