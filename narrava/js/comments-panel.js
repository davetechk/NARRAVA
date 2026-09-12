// comments-panel.js
//
// Real comment panel content — one implementation, used by both the
// mobile feed's sheet and the desktop watch page's drawer (see the two
// controller instances at the bottom). Reads/writes go through
// social.js (fetchSeriesComments/postSeriesComment/deleteSeriesComment/
// toggleCommentLike/isCurrentUserAdmin) — get_series_comments is the one
// real source for comment data, this file never queries series_comments
// directly for a list.
//
// Reply depth itself is unlimited — a reply can be posted on any other
// comment or reply, at any depth, and parent_comment_id always points at
// whichever exact comment was actually being replied to (never forced up
// to the top-level id). What stays fixed is the VISUAL indentation: every
// non-root comment renders at the same single indent level regardless of
// its real depth, with its own "@name" naming whichever specific comment
// it actually replies to. This is done by rendering an entire root's
// descendant subtree as one flat list inside a single .cmt-replies
// wrapper (never nesting one .cmt-replies inside another, which would
// compound the indent per level) — see buildRepliesFragments below. Each
// node in that flat list still gets its own independent "N replies"
// collapse/expand toggle for its own direct children, hidden by default.
//
// After any write (post, delete, like), the whole panel just re-fetches
// via load() rather than guessing the new state locally — simpler and
// guaranteed correct, since get_series_comments already computes
// like_count/liked_by_me for us.

function commentDisplayName(c){
  return (c.display_name && c.display_name.trim()) ? c.display_name.trim() : 'Narrava viewer';
}

// Deterministic color from the name so the same person always gets the
// same avatar color across renders/reloads — not random, not invented
// per-render.
const CMT_AVATAR_COLORS = ['#7DB359', '#A9C977', '#588C40', '#3b82c4', '#c47d3b', '#a83b6f', '#3ba894'];
function commentAvatarHtml(name){
  const initial = name.trim().charAt(0).toUpperCase() || 'N';
  let hash = 0;
  for(let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const color = CMT_AVATAR_COLORS[hash % CMT_AVATAR_COLORS.length];
  return '<div class="cmt-avatar" style="background:' + color + '">' + escapeHtml(initial) + '</div>';
}

function createCommentsPanelController(els){
  let seriesId = null;
  let comments = [];
  let commentsById = {};
  let childrenByParent = {};
  let expandedReplyGroups = new Set(); // comment ids whose own direct children are currently shown
  let activeReplyBoxId = null; // comment id (any depth) currently showing an inline reply composer
  let confirmDeleteId = null;
  let isAdmin = false;
  let myUserId = null;

  // Splits the flat RPC result into top-level comments plus a general
  // parent-id -> children map. childrenByParent is keyed by ANY comment's
  // id, not just top-level ones, so it already supports real, unlimited
  // reply depth — nothing here caps how deep parent_comment_id can chain.
  function groupComments(list){
    const topLevel = [];
    const byParent = {};
    const byId = {};
    list.forEach(c => { byId[c.id] = c; });
    list.forEach(c => {
      if(c.parent_comment_id){
        (byParent[c.parent_comment_id] = byParent[c.parent_comment_id] || []).push(c);
      } else {
        topLevel.push(c);
      }
    });
    topLevel.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    Object.keys(byParent).forEach(pid => byParent[pid].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
    return { topLevel, byParent, byId };
  }

  function canDelete(c){
    return !!myUserId && (String(c.user_id) === String(myUserId) || isAdmin);
  }

  function actionsHtml(c){
    const likeBtn = '<button type="button" class="cmt-like' + (c.liked_by_me ? ' liked' : '') + '" data-action="like-comment" data-comment-id="' + c.id + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7.5-4.6-10-9.2C.5 8.4 2.3 4.8 6 4.2c2.3-.4 4.3.9 6 3 1.7-2.1 3.7-3.4 6-3 3.7.6 5.5 4.2 4 7.6C19.5 16.4 12 21 12 21z"/></svg>' +
      '<span>' + (c.like_count || 0) + '</span>' +
    '</button>';
    // Reply is available on every comment regardless of depth — replying
    // to a reply is a real, unlimited-depth action now, not just on
    // top-level comments.
    const replyBtn = '<button type="button" class="cmt-reply-btn" data-action="reply" data-comment-id="' + c.id + '">Reply</button>';
    let deleteHtml = '';
    if(canDelete(c)){
      deleteHtml = confirmDeleteId === c.id
        ? '<span class="cmt-delete-confirm">Delete? ' +
            '<button type="button" class="cmt-delete-yes" data-action="confirm-delete" data-comment-id="' + c.id + '">Yes</button> ' +
            '<button type="button" class="cmt-delete-no" data-action="cancel-delete-confirm" data-comment-id="' + c.id + '">Cancel</button>' +
          '</span>'
        : '<button type="button" class="cmt-delete-btn" data-action="ask-delete" data-comment-id="' + c.id + '">Delete</button>';
    }
    return '<div class="cmt-actions">' + likeBtn + replyBtn + deleteHtml + '</div>';
  }

  function rowHtml(c, isReply, mentionName){
    const name = commentDisplayName(c);
    const mention = isReply && mentionName ? '<span class="cmt-mention">@' + escapeHtml(mentionName) + '</span> ' : '';
    return '<div class="cmt-row' + (isReply ? ' cmt-reply' : '') + '" data-comment-id="' + c.id + '">' +
      commentAvatarHtml(name) +
      '<div class="cmt-main">' +
        '<div class="cmt-meta"><span class="cmt-name">' + escapeHtml(name) + '</span><span class="cmt-time">' + timeAgo(c.created_at) + '</span></div>' +
        '<div class="cmt-body-text">' + mention + escapeHtml(c.body) + '</div>' +
        actionsHtml(c) +
        (activeReplyBoxId === c.id ? replyBoxHtml(c.id) : '') +
      '</div>' +
    '</div>';
  }

  function replyBoxHtml(parentId){
    return '<div class="cmt-reply-box">' +
      '<input type="text" class="cmt-reply-input" data-parent-id="' + parentId + '" placeholder="Write a reply…" autocomplete="off">' +
      '<button type="button" class="cmt-reply-post" data-action="post-reply" data-parent-id="' + parentId + '">Reply</button>' +
      '<button type="button" class="cmt-reply-cancel" data-action="cancel-reply">Cancel</button>' +
    '</div>';
  }

  function repliesToggleHtml(parentId, count, expanded){
    return '<button type="button" class="cmt-replies-toggle' + (expanded ? ' expanded' : '') + '" data-action="toggle-replies" data-comment-id="' + parentId + '">' +
      count + ' ' + (count === 1 ? 'reply' : 'replies') +
      ' <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6"/></svg>' +
    '</button>';
  }

  // Builds the flat list of html fragments for parentId's own replies —
  // its "N replies" toggle (if it has any direct children) plus, only
  // once expanded, each child row followed immediately by that child's
  // own fragments (recursive). Every fragment this returns is appended
  // as a direct sibling inside ONE .cmt-replies wrapper per root — never
  // nested .cmt-replies-in-.cmt-replies — so no matter how deep the real
  // parent_comment_id chain goes, everything renders at the exact same
  // single indent level, each with its own correct "@name" mention and
  // its own independent collapse/expand toggle.
  function buildRepliesFragments(parentId){
    const children = childrenByParent[parentId] || [];
    if(!children.length) return [];
    const expanded = expandedReplyGroups.has(parentId);
    const parts = [repliesToggleHtml(parentId, children.length, expanded)];
    if(!expanded) return parts;
    const parentAuthorName = commentDisplayName(commentsById[parentId]);
    children.forEach(child => {
      parts.push(rowHtml(child, true, parentAuthorName));
      parts.push.apply(parts, buildRepliesFragments(child.id));
    });
    return parts;
  }

  function render(){
    if(els.countEl) els.countEl.textContent = comments.length ? String(comments.length) : '';

    if(!comments.length){
      els.bodyEl.innerHTML = '<div class="cmt-empty">No comments yet — be the first to say something.</div>';
      wireComposer();
      return;
    }

    const { topLevel, byParent, byId } = groupComments(comments);
    childrenByParent = byParent;
    commentsById = byId;

    els.bodyEl.innerHTML = topLevel.map(c => {
      const replyParts = buildRepliesFragments(c.id);
      const repliesBlock = replyParts.length ? '<div class="cmt-replies">' + replyParts.join('') + '</div>' : '';
      return rowHtml(c, false, null) + repliesBlock;
    }).join('');
    wireRows();
    wireComposer();
  }

  function wireRows(){
    els.bodyEl.querySelectorAll('[data-action="like-comment"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.commentId;
        const c = comments.find(x => String(x.id) === String(id));
        if(!c) return;
        const result = await toggleCommentLike(id, c.liked_by_me);
        if(result === null) return;
        await load(seriesId);
      });
    });

    els.bodyEl.querySelectorAll('[data-action="reply"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.commentId;
        activeReplyBoxId = activeReplyBoxId === id ? null : id;
        render();
        if(activeReplyBoxId){
          const input = els.bodyEl.querySelector('.cmt-reply-input[data-parent-id="' + activeReplyBoxId + '"]');
          if(input) input.focus();
        }
      });
    });

    els.bodyEl.querySelectorAll('[data-action="cancel-reply"]').forEach(btn => {
      btn.addEventListener('click', () => { activeReplyBoxId = null; render(); });
    });

    els.bodyEl.querySelectorAll('[data-action="post-reply"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const parentId = btn.dataset.parentId;
        const input = els.bodyEl.querySelector('.cmt-reply-input[data-parent-id="' + parentId + '"]');
        const body = input ? input.value : '';
        const ok = await postSeriesComment(seriesId, body, parentId);
        if(!ok) return;
        activeReplyBoxId = null;
        expandedReplyGroups.add(parentId); // the reply they just wrote should be visible, not hidden behind "Show more"
        await load(seriesId);
      });
    });

    els.bodyEl.querySelectorAll('[data-action="toggle-replies"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.commentId;
        if(expandedReplyGroups.has(id)) expandedReplyGroups.delete(id);
        else expandedReplyGroups.add(id);
        render();
      });
    });

    els.bodyEl.querySelectorAll('[data-action="ask-delete"]').forEach(btn => {
      btn.addEventListener('click', () => { confirmDeleteId = btn.dataset.commentId; render(); });
    });
    els.bodyEl.querySelectorAll('[data-action="cancel-delete-confirm"]').forEach(btn => {
      btn.addEventListener('click', () => { confirmDeleteId = null; render(); });
    });
    els.bodyEl.querySelectorAll('[data-action="confirm-delete"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.commentId;
        confirmDeleteId = null;
        const ok = await deleteSeriesComment(id);
        if(!ok) return;
        showToast('Comment deleted ✓');
        await load(seriesId);
      });
    });
  }

  // Composer (the always-visible "Add a comment…" box) is wired once,
  // not re-wired on every render — it lives outside els.bodyEl, so
  // repopulating the body's innerHTML never touches it.
  function wireComposer(){
    if(els.postBtn.dataset.wired) return;
    els.postBtn.dataset.wired = '1';
    const submit = async () => {
      const body = els.inputEl.value;
      const ok = await postSeriesComment(seriesId, body, null);
      if(!ok) return;
      els.inputEl.value = '';
      await load(seriesId);
    };
    els.postBtn.addEventListener('click', submit);
    els.inputEl.addEventListener('keydown', (e) => {
      if(e.key === 'Enter'){ e.preventDefault(); submit(); }
    });
  }

  async function load(newSeriesId){
    seriesId = newSeriesId;
    els.bodyEl.innerHTML = narravaLoaderHtml('pulse', 'Loading comments…');
    if(els.countEl) els.countEl.textContent = '';

    const [fetchedComments, admin, userId] = await Promise.all([
      fetchSeriesComments(newSeriesId),
      isCurrentUserAdmin(),
      getSignedInUserId()
    ]);
    if(seriesId !== newSeriesId) return; // moved to a different series (or closed/reopened) before this resolved

    comments = fetchedComments;
    isAdmin = admin;
    myUserId = userId;
    expandedReplyGroups = new Set();
    activeReplyBoxId = null;
    confirmDeleteId = null;
    render();
  }

  return { load };
}

// ================= The two real instances =================

const feedCommentsController = createCommentsPanelController({
  bodyEl: document.getElementById('feedCommentsBody'),
  countEl: document.getElementById('feedCommentsCount'),
  inputEl: document.getElementById('feedCommentsInput'),
  postBtn: document.getElementById('feedCommentsPost')
});

const watchCommentsController = createCommentsPanelController({
  bodyEl: document.getElementById('watchCommentsBody'),
  countEl: document.getElementById('watchCommentsCount'),
  inputEl: document.getElementById('watchCommentsInput'),
  postBtn: document.getElementById('watchCommentsPost')
});
