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
// implementations of the same real lookup. commentCount reuses
// fetchSeriesComments (the one real source for comment data — see
// below) rather than a separate count-only query, so the number shown
// next to the Comment icon on the main screen can never drift from the
// same real total the opened panel's own heading shows.
async function fetchSeriesSocialState(seriesId){
  const userId = await getSignedInUserId();
  const [likeCount, myState, commentCount] = await Promise.all([
    fetchSeriesLikeCount(seriesId),
    fetchMySeriesLikeSaveState(seriesId, userId),
    fetchSeriesCommentCount(seriesId)
  ]);
  return { likeCount, liked: myState.liked, saved: myState.saved, commentCount };
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

// The Library tab's one real source (see library.js) — every series id
// the signed-in viewer has actually saved, straight off series_saves,
// same table toggleSeriesSave below writes to. Returns null (not an
// empty Set) when nobody's signed in — deliberately getRealAccountUserId,
// not getSignedInUserId: a real anonymous account isn't enough to see a
// Library, only a genuine sign-up is, same real distinction
// toggleSeriesSave below makes. Callers use the null/Set split to tell
// "signed out (or anonymous-only)" apart from "signed in for real,
// genuinely nothing saved" — those need two different honest empty
// states, never the same one.
async function fetchMySavedSeriesIds(){
  const userId = await getRealAccountUserId();
  if(!userId) return null;
  try {
    const { data, error } = await supabaseClient.from('series_saves').select('series_id').eq('user_id', userId);
    if(error) throw error;
    return new Set((data || []).map(row => row.series_id));
  } catch(err){
    console.error('Narrava: failed to fetch saved series', err);
    return new Set();
  }
}

// Same shape as toggleSeriesLike, against series_saves — personal only,
// no public count (never asked for, saves don't need one). Deliberately
// getRealAccountUserId, not getSignedInUserId: saving a series still
// needs a genuine, real (sign-up-backed) account — a real anonymous
// account is not enough here, unlike like/comment/reply.
async function toggleSeriesSave(seriesId, currentlySaved){
  const userId = await getRealAccountUserId();
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

// The real total shown next to the Comment icon on the main screen
// (mobile feed and desktop watch page) — comments and replies together,
// same number the opened panel's own heading shows, since both read it
// off the same fetchSeriesComments array rather than two separate ways
// of counting.
async function fetchSeriesCommentCount(seriesId){
  const comments = await fetchSeriesComments(seriesId);
  return comments.length;
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
