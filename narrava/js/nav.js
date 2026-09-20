// nav.js
//
// Tells the browser about the app's own navigation, using the standard
// History API, so the phone's Back button (or the browser's Back, or an
// iOS edge-swipe) takes someone to their real previous screen instead of
// leaving the page.
//
// Why this was needed: Narrava is a single page. Nothing ever told the
// browser that entering a series or switching tab was a step forward, so
// the browser had exactly one entry for the whole visit and the first Back
// press left the app. It was worse than it sounds on a phone: entering
// the For You feed hides the bottom nav (body.feed-active .bottomnav), so
// Back is the *only* way out of the feed there.
//
// The model — one history entry per real navigation step:
//   * a screen change (Home → For You → Library → Profile → desktop Watch
//     page), and
//   * entering the "watching" state of a series (tap a poster, or Continue
//     in the For You feed).
// Swiping between episodes or rolling into the next series while already
// watching does NOT add entries — Back leaves the series, it doesn't
// rewind episode by episode.
//
// Overlays (comment sheet, episode grid, Get Coins sheet, sign-in and
// username modals, share popup, desktop comments drawer, desktop search)
// don't get entries of their own. Back closes the topmost open one first
// and stays on the same screen (see the popstate handler) — so opening and
// closing them by tap never touches the history at all.
//
// The first entry is always a base entry for Home, written at load. Back
// at the base has nowhere left to go inside the app, so the browser does
// what it normally does there: leaves / closes the installed app.
//
// Depends on (all defined elsewhere, only ever called at event time):
//   app.js: showScreen, activeScreenName, feed, idx, slides, goTo,
//     openSeriesInFeed, clearPendingResume, refreshContinueWatchingMap,
//     renderContinueWatchingBar, closeCommentsSheet, closeEpisodeGrid,
//     closeSheet, closeTopbarSearch, topbarSearchBar, episodeGridSheet,
//     commentsSheet, coinSheet
//   auth.js / profile.js / shared-utils.js / watch.js: the modal/drawer
//     close functions and backdrops used in NAV_OVERLAYS below.

// The state object sitting on the current history entry:
//   { narrava:true, screen, watching, sid, n }
//   screen   'discover' | 'feed' | 'library' | 'profile' | 'watch'
//   watching true while inside a series on the feed screen
//   sid      id of the series being watched (only used to reopen it if the
//            browser's Forward button lands on this entry again)
//   n        depth: 0 is the base entry
let navCurrent = { narrava: true, screen: 'discover', watching: false, sid: null, n: 0 };
let navApplying = false; // true while we're reacting to Back/Forward — those changes must not push entries of their own

// Base entry. replaceState keeps the current URL (including a shared
// #series=… link, which app.js reads and clears after this).
history.replaceState(navCurrent, '');

function navSnapshot(){
  const screen = activeScreenName;
  const watching = screen === 'feed' && feed.classList.contains('watching');
  let sid = null;
  if(watching && slides[idx]) sid = slides[idx].id;
  else if(screen === 'watch' && typeof watchSlide !== 'undefined' && watchSlide) sid = watchSlide.id;
  return { narrava: true, screen, watching, sid };
}

// Called by showScreen (every screen change) and the desktop
// enter-watching handlers. Adds a history entry only when the screen or
// the watching state genuinely changed.
function navSync(){
  if(navApplying) return;
  const snap = navSnapshot();

  if(navCurrent.screen === snap.screen && navCurrent.watching === snap.watching){
    if(navCurrent.sid !== snap.sid){           // same step, different series (rolled into the next one): just remember which
      navCurrent = { ...navCurrent, sid: snap.sid };
      history.replaceState(navCurrent, '');
    }
    return;
  }

  const next = { ...snap, n: navCurrent.n + 1 };
  if(history.state && history.state.narrava) history.pushState(next, '');
  else history.replaceState(next, '');         // an entry the browser made itself (pasting a #series link into an open tab) — adopt it instead of stacking another
  navCurrent = next;
}

// The on-screen back arrow (desktop watch page) should behave exactly like
// the browser's Back. If somehow there's no earlier app entry, fall back
// to Home.
function navBack(){
  if(navCurrent.n > 0) history.back();
  else showScreen('discover');
}

// Topmost first. Each entry: is it open, and how to close it with the
// overlay's own real close function.
const NAV_OVERLAYS = [
  { isOpen: () => authModalBackdrop.classList.contains('open'),                              close: () => closeAuthModal() },
  { isOpen: () => usernameModalBackdrop.classList.contains('open'),                          close: () => closeUsernameModal() },
  { isOpen: () => !!shareSheetBackdrop && shareSheetBackdrop.classList.contains('open'),     close: () => closeShareFallback() },
  { isOpen: () => episodeGridSheet.classList.contains('open'),                               close: () => closeEpisodeGrid() },
  { isOpen: () => commentsSheet.classList.contains('open'),                                  close: () => closeCommentsSheet() },
  { isOpen: () => coinSheet.classList.contains('open'),                                      close: () => closeSheet() },
  { isOpen: () => watchCommentsBackdrop.classList.contains('open'),                          close: () => closeWatchComments() },
  { isOpen: () => topbarSearchBar.classList.contains('open'),                                close: () => closeTopbarSearch() }
];

// Closes the topmost open overlay; returns whether there was one.
function navCloseTopOverlay(){
  for(const o of NAV_OVERLAYS){
    if(o.isOpen()){ o.close(); return true; }
  }
  return false;
}

// Puts the UI on the screen/state a history entry describes. Used for
// Back and Forward. Goes through the app's own functions, so leaving a
// screen stops its video and saves progress exactly as any other
// navigation does.
async function navApply(target){
  navApplying = true;
  try {
    const feedWatching = feed.classList.contains('watching');

    if(target.screen === 'feed'){
      if(target.watching){
        // Forward into a series: reopen it the same way a tap does.
        const i = target.sid ? slides.findIndex(s => s.id === target.sid) : -1;
        if(activeScreenName === 'feed' && feedWatching){
          // already there
        } else if(i !== -1){
          await openSeriesInFeed(i);
        } else {
          showScreen('feed');
        }
      } else {
        // Back out of watching to the browsing feed (or into it from
        // another screen). goTo() drops the watching/paused state and
        // re-renders; the video for the current slide keeps playing.
        if(feedWatching){ clearPendingResume(); goTo(idx); }
        showScreen('feed');
      }
    } else if(target.screen === 'watch'){
      const i = target.sid ? slides.findIndex(s => s.id === target.sid) : -1;
      if(i !== -1) await openSeriesInFeed(i);
      else showScreen('discover');
    } else {
      showScreen(target.screen);
      // Leaving the feed must leave it clean, so the next visit to For You
      // starts in browsing rather than resuming a stale watching state.
      feed.classList.remove('watching', 'paused');
      clearPendingResume();
      // Same refresh the tab buttons do when they're tapped.
      if(target.screen === 'discover') refreshContinueWatchingMap().then(renderContinueWatchingBar);
      else if(target.screen === 'library') renderLibraryScreen();
      else if(target.screen === 'profile') renderProfileScreen();
    }
  } finally {
    navApplying = false;
    navCurrent = target;
  }
}

window.addEventListener('popstate', (e) => {
  const target = e.state;
  if(!target || !target.narrava) return;       // a fragment navigation or something we didn't create — not ours to handle

  // Back with an overlay open closes the overlay and stays put. The
  // browser has already stepped back one entry, so step forward again by
  // pushing the entry we were on — the history ends up exactly as it was.
  if(navCloseTopOverlay()){
    history.pushState(navCurrent, '');
    return;
  }
  navApply(target);
});
