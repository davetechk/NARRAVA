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
// One level of nesting only, matching the task: a reply to a reply just
// becomes another reply on the same top-level comment (parent_comment_id
// always points at a top-level comment, never at another reply — this
// file enforces that by always passing the top-level id as the parent,
// even when "Reply" is clicked on a reply row).
//
// After any write (post, delete, like), the whole panel just re-fetches
// via load() rather than guessing the new state locally — simpler and
// guaranteed correct, since get_series_comments already computes
// like_count/liked_by_me for us.

const REPLIES_SHOWN_BY_DEFAULT = 2;

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
  let repliesByParent = {};
  let expandedReplyGroups = new Set();
  let activeReplyBoxId = null; // top-level comment id currently showing an inline reply composer
  let confirmDeleteId = null;
  let isAdmin = false;
  let myUserId = null;

  function groupComments(list){
    const topLevel = [];
    const byParent = {};
    list.forEach(c => {
      if(c.parent_comment_id){
        (byParent[c.parent_comment_id] = byParent[c.parent_comment_id] || []).push(c);
      } else {
        topLevel.push(c);
      }
    });
    topLevel.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    Object.keys(byParent).forEach(pid => byParent[pid].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
    return { topLevel, byParent };
  }

  function canDelete(c){
    return !!myUserId && (String(c.user_id) === String(myUserId) || isAdmin);
  }

  function actionsHtml(c, isReply){
    const likeBtn = '<button type="button" class="cmt-like' + (c.liked_by_me ? ' liked' : '') + '" data-action="like-comment" data-comment-id="' + c.id + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7.5-4.6-10-9.2C.5 8.4 2.3 4.8 6 4.2c2.3-.4 4.3.9 6 3 1.7-2.1 3.7-3.4 6-3 3.7.6 5.5 4.2 4 7.6C19.5 16.4 12 21 12 21z"/></svg>' +
      '<span>' + (c.like_count || 0) + '</span>' +
    '</button>';
    const replyBtn = isReply ? '' : '<button type="button" class="cmt-reply-btn" data-action="reply" data-comment-id="' + c.id + '">Reply</button>';
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
        actionsHtml(c, isReply) +
        (!isReply && activeReplyBoxId === c.id ? replyBoxHtml(c.id) : '') +
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

  function repliesHtml(parentId, parentAuthorName){
    const replies = repliesByParent[parentId] || [];
    if(!replies.length) return '';
    const expanded = expandedReplyGroups.has(parentId);
    const visible = expanded ? replies : replies.slice(0, REPLIES_SHOWN_BY_DEFAULT);
    const remaining = replies.length - visible.length;
    let html = '<div class="cmt-replies">' + visible.map(r => rowHtml(r, true, parentAuthorName)).join('');
    if(remaining > 0){
      html += '<button type="button" class="cmt-show-more" data-action="show-more-replies" data-comment-id="' + parentId + '">Show more replies (' + remaining + ') <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6"/></svg></button>';
    }
    html += '</div>';
    return html;
  }

  function render(){
    if(els.countEl) els.countEl.textContent = comments.length ? String(comments.length) : '';

    if(!comments.length){
      els.bodyEl.innerHTML = '<div class="cmt-empty">No comments yet — be the first to say something.</div>';
      wireComposer();
      return;
    }

    const { topLevel, byParent } = groupComments(comments);
    repliesByParent = byParent;

    els.bodyEl.innerHTML = topLevel.map(c => rowHtml(c, false, null) + repliesHtml(c.id, commentDisplayName(c))).join('');
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

    els.bodyEl.querySelectorAll('[data-action="show-more-replies"]').forEach(btn => {
      btn.addEventListener('click', () => {
        expandedReplyGroups.add(btn.dataset.commentId);
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
