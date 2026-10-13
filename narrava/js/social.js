// Likes, saves, shares and comments. Write helpers open the sign-in popup
// and resolve null when not signed in or the write fails.

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

// Public save + share totals (get_series_social_counts)
async function fetchSeriesSaveShareCounts(seriesId){
  try {
    const { data, error } = await supabaseClient.rpc('get_series_social_counts', { p_series_id: seriesId });
    if(error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return {
      saves: row ? (Number(row.saves) || 0) : 0,
      shares: row ? (Number(row.shares) || 0) : 0
    };
  } catch(err){
    console.error('Narrava: failed to fetch series save/share counts', err);
    return { saves: 0, shares: 0 };
  }
}

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

// Counts and this viewer's liked/saved state for one series (feed and watch page)
async function fetchSeriesSocialState(seriesId){
  const userId = await getSignedInUserId();
  const [likeCount, myState, commentCount, saveShare] = await Promise.all([
    fetchSeriesLikeCount(seriesId),
    fetchMySeriesLikeSaveState(seriesId, userId),
    fetchSeriesCommentCount(seriesId),
    fetchSeriesSaveShareCounts(seriesId)
  ]);
  return {
    likeCount, liked: myState.liked, saved: myState.saved, commentCount,
    saveCount: saveShare.saves, shareCount: saveShare.shares
  };
}

// Returns the new liked state, or null if nothing happened
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
    showToast('Couldn’t update the like. Try again.');
    return null;
  }
}

// Saved series ids for a real account; null when signed out or a guest
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

// Needs a real account (guests can't save)
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
    showToast('Couldn’t update the save. Try again.');
    return null;
  }
}

// ================= Comments =================

// All comments and replies with like counts (works signed out)
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

// Comments + replies, same number as the panel heading
async function fetchSeriesCommentCount(seriesId){
  const comments = await fetchSeriesComments(seriesId);
  return comments.length;
}

// parentCommentId null for a top-level comment. true, or null if nothing happened.
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
    showToast('Couldn’t post the comment. Try again.');
    return null;
  }
}

// RLS decides who may delete; replies go with it (database cascade)
async function deleteSeriesComment(commentId){
  try {
    const { error } = await supabaseClient.from('series_comments').delete().eq('id', commentId);
    if(error) throw error;
    return true;
  } catch(err){
    console.error('Narrava: failed to delete comment', err);
    showToast('Couldn’t delete the comment. Try again.');
    return false;
  }
}

// Like on one comment. null if nothing happened.
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
    showToast('Couldn’t update the like. Try again.');
    return null;
  }
}

// Only decides whether to show admin delete; RLS is the real check
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
