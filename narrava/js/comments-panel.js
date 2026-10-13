// Comment panel, shared by the mobile sheet and the desktop drawer.
// Only roots get a replies toggle; replies render as nested containers, any depth.

// Replies shown when a root's toggle opens, before "Load more"
const REPLIES_INITIAL_BATCH = 5;

// Stable fallback name from the user id, for accounts without a username
function fallbackViewerName(userId){
  const slice = String(userId || '').replace(/-/g, '').slice(0, 6).toUpperCase();
  return slice ? 'Viewer ' + slice : 'Narrava viewer';
}

function commentDisplayName(c){
  return (c.display_name && c.display_name.trim()) ? c.display_name.trim() : fallbackViewerName(c.user_id);
}

// Avatar color from the name, same every time
const CMT_AVATAR_COLORS = ['#1A8445', '#157A3A', '#0F6B32', '#3b82c4', '#c47d3b', '#a83b6f', '#3ba894'];
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
  let expandedRoots = new Set(); // roots whose reply chain is open
  let visibleCounts = {}; // root id -> replies shown
  let activeReplyBoxId = null; // comment id with the reply box open
  let confirmDeleteId = null;
  let isAdmin = false;
  let myUserId = null;

  // Top-level comments + parent id -> children map (any depth)
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

  function repliesToggleHtml(rootId, count, expanded){
    return '<button type="button" class="cmt-replies-toggle' + (expanded ? ' expanded' : '') + '" data-action="toggle-replies" data-comment-id="' + rootId + '">' +
      count + ' ' + (count === 1 ? 'reply' : 'replies') +
      ' <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6"/></svg>' +
    '</button>';
  }

  // All descendants under parentId (toggle label and "Load more" count)
  function countDescendants(parentId){
    const children = childrenByParent[parentId] || [];
    let total = children.length;
    children.forEach(child => { total += countDescendants(child.id); });
    return total;
  }

  // Top-level ancestor of a comment
  function findRootId(commentId){
    let current = commentsById[commentId];
    while(current && current.parent_comment_id){
      current = commentsById[current.parent_comment_id];
    }
    return current ? current.id : commentId;
  }

  // Children of parentId as nested containers, depth-first.
  // budget.remaining is shared across the walk for the "Load more" cutoff.
  function renderChildrenHtml(parentId, budget){
    const children = childrenByParent[parentId] || [];
    if(!children.length || budget.remaining <= 0) return '';
    const parentAuthorName = commentDisplayName(commentsById[parentId]);
    let html = '';
    for(let i = 0; i < children.length && budget.remaining > 0; i++){
      const child = children[i];
      budget.remaining--;
      html += rowHtml(child, true, parentAuthorName) + renderChildrenHtml(child.id, budget);
    }
    return html ? '<div class="cmt-replies">' + html + '</div>' : '';
  }

  function repliesBlockHtml(root){
    const total = countDescendants(root.id);
    if(!total) return '';
    const expanded = expandedRoots.has(root.id);
    if(!expanded){
      return '<div class="cmt-root-replies">' + repliesToggleHtml(root.id, total, false) + '</div>';
    }
    const visibleLimit = Math.min(visibleCounts[root.id] || REPLIES_INITIAL_BATCH, total);
    const budget = { remaining: visibleLimit };
    const nested = renderChildrenHtml(root.id, budget);
    const remaining = total - visibleLimit;
    let html = repliesToggleHtml(root.id, total, true) + nested;
    if(remaining > 0){
      html += '<button type="button" class="cmt-load-more" data-action="load-more-replies" data-comment-id="' + root.id + '">Load ' + remaining + ' more repl' + (remaining === 1 ? 'y' : 'ies') + '</button>';
    }
    return '<div class="cmt-root-replies">' + html + '</div>';
  }

  function render(){
    if(els.countEl) els.countEl.textContent = comments.length ? String(comments.length) : '';

    if(!comments.length){
      els.bodyEl.innerHTML = '<div class="cmt-empty">No comments yet. Be the first.</div>';
      wireComposer();
      return;
    }

    const { topLevel, byParent, byId } = groupComments(comments);
    childrenByParent = byParent;
    commentsById = byId;

    els.bodyEl.innerHTML = topLevel.map(c => rowHtml(c, false, null) + repliesBlockHtml(c)).join('');
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
        // Show the new reply: open its root and lift the batch cap
        const rootId = findRootId(parentId);
        expandedRoots.add(rootId);
        visibleCounts[rootId] = Infinity;
        await load(seriesId);
      });
    });

    els.bodyEl.querySelectorAll('[data-action="toggle-replies"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.commentId;
        if(expandedRoots.has(id)){
          expandedRoots.delete(id);
          delete visibleCounts[id];
        } else {
          expandedRoots.add(id);
        }
        render();
      });
    });

    els.bodyEl.querySelectorAll('[data-action="load-more-replies"]').forEach(btn => {
      btn.addEventListener('click', () => {
        visibleCounts[btn.dataset.commentId] = Infinity;
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

  // Composer is outside the body, so wire it once
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
    showSkeletonLogo();
    els.bodyEl.innerHTML = skeletonCommentRowsHtml(5);
    if(els.countEl) els.countEl.textContent = '';

    const [fetchedComments, admin, userId] = await Promise.all([
      fetchSeriesComments(newSeriesId),
      isCurrentUserAdmin(),
      getSignedInUserId()
    ]);
    if(seriesId !== newSeriesId){ hideSkeletonLogo(); return; } // series changed before this resolved

    comments = fetchedComments;
    isAdmin = admin;
    myUserId = userId;
    expandedRoots = new Set();
    visibleCounts = {};
    activeReplyBoxId = null;
    confirmDeleteId = null;
    render();
    hideSkeletonLogo();
    // Keep the Comment icon count in sync
    if(els.onCountChange) els.onCountChange(newSeriesId, comments.length);
  }

  return { load };
}

// ================= Instances =================

const feedCommentsController = createCommentsPanelController({
  bodyEl: document.getElementById('feedCommentsBody'),
  countEl: document.getElementById('feedCommentsCount'),
  inputEl: document.getElementById('feedCommentsInput'),
  postBtn: document.getElementById('feedCommentsPost'),
  onCountChange: (loadedSeriesId, count) => {
    const s = slides.find(sl => sl.id === loadedSeriesId);
    if(s) s.commentCount = count;
    if(slides[idx] && slides[idx].id === loadedSeriesId) commentCount.textContent = count;
  }
});

const watchCommentsController = createCommentsPanelController({
  bodyEl: document.getElementById('watchCommentsBody'),
  countEl: document.getElementById('watchCommentsCount'),
  inputEl: document.getElementById('watchCommentsInput'),
  postBtn: document.getElementById('watchCommentsPost'),
  onCountChange: (loadedSeriesId, count) => {
    if(watchSlide && watchSlide.id === loadedSeriesId){
      watchSlide.commentCount = count;
      watchCommentCount.textContent = count;
    }
  }
});
