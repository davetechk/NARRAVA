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
// to the top-level id).
//
// Only the original top-level comment gets a "N replies" toggle — there
// is no separate toggle at any deeper level. Tapping that one toggle
// reveals the comment's ENTIRE real reply chain, however deep it
// actually goes, all in one place (see renderChildrenHtml below), in the
// same depth-first order a real conversation actually happened in — a
// reply always lands right after the specific comment it answers.
//
// Worked out directly as two diagrams with the person running this
// project: each reply's connecting line has to visibly branch from the
// specific comment it answers, not run as one line straight from the
// root through everything under it — so this renders REAL nested
// containers (one .cmt-replies per parent that actually has visible
// children), each contributing one small indent step and its own
// border-left, rather than one flat list at a single indent. Two
// replies answering the same comment share that comment's own nested
// container, so they land at the same small indent, branching from the
// same point; something replying to one of those two gets its own
// nested container one further small step in. The indent step stays
// small and fixed regardless of depth specifically so a genuinely deep
// thread doesn't become unreadable on a narrow phone.
//
// If a root's real reply count is more than a reasonable first batch,
// a real "Load more" control reveals the rest in place — a shared
// budget threaded through the recursive render (see the `budget`
// param below) that cuts the same depth-first walk off at N items,
// wherever in the tree that happens to land, not a second kind of
// toggle.
//
// After any write (post, delete, like), the whole panel just re-fetches
// via load() rather than guessing the new state locally — simpler and
// guaranteed correct, since get_series_comments already computes
// like_count/liked_by_me for us.

// How many of a root's flattened replies show right away once its
// toggle is opened, before "Load more" is needed — a reasonable first
// batch, not the honest full count (that's what the toggle's own number
// already shows).
const REPLIES_INITIAL_BATCH = 5;

// A real, stable identifier for whoever hasn't set a real username yet
// (profiles.display_name — see profile.js) — drawn directly from that
// account's own real, permanent user_id (get_series_comments already
// returns it, used elsewhere here for the "is this my own comment"
// check), the same slice every time for that same account, never
// random and never invented fresh per render. Replaces the old flat
// "Narrava viewer" label every nameless commenter used to share
// identically, which made two different anonymous or unnamed accounts
// genuinely indistinguishable in a real thread.
function fallbackViewerName(userId){
  const slice = String(userId || '').replace(/-/g, '').slice(0, 6).toUpperCase();
  return slice ? 'Viewer ' + slice : 'Narrava viewer';
}

function commentDisplayName(c){
  return (c.display_name && c.display_name.trim()) ? c.display_name.trim() : fallbackViewerName(c.user_id);
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
  let expandedRoots = new Set(); // top-level comment ids whose full reply chain is currently open
  let visibleCounts = {}; // root id -> how many of its flattened replies are currently shown
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

  function repliesToggleHtml(rootId, count, expanded){
    return '<button type="button" class="cmt-replies-toggle' + (expanded ? ' expanded' : '') + '" data-action="toggle-replies" data-comment-id="' + rootId + '">' +
      count + ' ' + (count === 1 ? 'reply' : 'replies') +
      ' <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6"/></svg>' +
    '</button>';
  }

  // Total real descendant count under parentId, however deep — used only
  // for the root's own toggle label and the "Load more" remaining count,
  // not for rendering (that's the recursive walk below, kept as its own
  // separate pass so this count logic — unchanged — stays independent
  // of how the tree actually gets drawn).
  function countDescendants(parentId){
    const children = childrenByParent[parentId] || [];
    let total = children.length;
    children.forEach(child => { total += countDescendants(child.id); });
    return total;
  }

  // Finds the top-level ancestor of any comment id — used after posting
  // a reply so the right ROOT gets expanded (only roots have a toggle
  // now, so expanding "the parent that was just replied to" only makes
  // sense once translated up to its root).
  function findRootId(commentId){
    let current = commentsById[commentId];
    while(current && current.parent_comment_id){
      current = commentsById[current.parent_comment_id];
    }
    return current ? current.id : commentId;
  }

  // Recursively renders parentId's own real children, each followed
  // immediately by its own children (same depth-first, "reply lands
  // right after what it answers" order as before) — but now as REAL
  // nested .cmt-replies containers instead of one flat list, so each
  // container's border-left visibly branches from parentId's own row
  // and only ever spans parentId's own children, never anyone else's.
  // budget.remaining is shared across the whole walk (mutated in place)
  // so "Load more"'s batch cutoff lands at the same item regardless of
  // which branch of the tree it falls in — the identical cutoff the old
  // flat slice() did, just expressed while actually nesting.
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
      els.bodyEl.innerHTML = '<div class="cmt-empty">No comments yet — be the first to say something.</div>';
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
        // The reply they just wrote should be visible, not hidden behind
        // the root's own toggle or a "Load more" — only roots have a
        // toggle now, so expand whichever root this reply actually
        // belongs to, and lift the batch cap so the new one shows.
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
    expandedRoots = new Set();
    visibleCounts = {};
    activeReplyBoxId = null;
    confirmDeleteId = null;
    render();
    // Lets the main screen's own Comment icon badge (app.js/watch.js)
    // stay in sync with the exact same real total this panel's heading
    // just showed — one real source, read in two places.
    if(els.onCountChange) els.onCountChange(newSeriesId, comments.length);
  }

  return { load };
}

// ================= The two real instances =================

const feedCommentsController = createCommentsPanelController({
  bodyEl: document.getElementById('feedCommentsBody'),
  countEl: document.getElementById('feedCommentsCount'),
  inputEl: document.getElementById('feedCommentsInput'),
  postBtn: document.getElementById('feedCommentsPost'),
  // Mirrors the real total onto the mobile feed's own Comment icon —
  // slides[idx] is always the series this panel was opened for.
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
  // Same real mirroring onto the desktop watch page's own Comment icon.
  onCountChange: (loadedSeriesId, count) => {
    if(watchSlide && watchSlide.id === loadedSeriesId){
      watchSlide.commentCount = count;
      watchCommentCount.textContent = count;
    }
  }
});
