// Browser history for in-app navigation, so Back goes to the previous screen.
// One entry per screen change or entering a series; overlays close on Back instead.

// History state: { narrava:true, screen, watching, sid, n } (n = depth, 0 is the base entry)
let navCurrent = { narrava: true, screen: 'discover', watching: false, sid: null, n: 0 };
let navApplying = false; // true while applying Back/Forward

// Base entry (keeps a #series=… link for app.js)
history.replaceState(navCurrent, '');

function navSnapshot(){
  const screen = activeScreenName;
  const watching = screen === 'feed' && feed.classList.contains('watching');
  let sid = null;
  if(watching && slides[idx]) sid = slides[idx].id;
  else if(screen === 'watch' && typeof watchSlide !== 'undefined' && watchSlide) sid = watchSlide.id;
  return { narrava: true, screen, watching, sid };
}

// Adds an entry only when the screen or watching state changed
function navSync(){
  if(navApplying) return;
  const snap = navSnapshot();

  if(navCurrent.screen === snap.screen && navCurrent.watching === snap.watching){
    if(navCurrent.sid !== snap.sid){           // same step, next series: just remember it
      navCurrent = { ...navCurrent, sid: snap.sid };
      history.replaceState(navCurrent, '');
    }
    return;
  }

  const next = { ...snap, n: navCurrent.n + 1 };
  if(history.state && history.state.narrava) history.pushState(next, '');
  else history.replaceState(next, '');         // an entry the browser made (pasted #series link): adopt it
  navCurrent = next;
}

// On-screen back arrow: same as browser Back, or Home if there's nowhere to go
function navBack(){
  if(navCurrent.n > 0) history.back();
  else showScreen('discover');
}

// Topmost first
const NAV_OVERLAYS = [
  { isOpen: () => downloadConfirmBackdrop.classList.contains('open'),                        close: () => closeDownloadConfirm() },
  { isOpen: () => authModalBackdrop.classList.contains('open'),                              close: () => closeAuthModal() },
  { isOpen: () => unlockModalBackdrop.classList.contains('open'),                            close: () => closeUnlockPrompt() },
  { isOpen: () => coinSheetBackdrop.classList.contains('open'),                              close: () => closeCoinSheet() },
  { isOpen: () => usernameModalBackdrop.classList.contains('open'),                          close: () => closeUsernameModal() },
  { isOpen: () => !!shareSheetBackdrop && shareSheetBackdrop.classList.contains('open'),     close: () => closeShareFallback() },
  { isOpen: () => episodeGridSheet.classList.contains('open'),                               close: () => closeEpisodeGrid() },
  { isOpen: () => commentsSheet.classList.contains('open'),                                  close: () => closeCommentsSheet() },
  { isOpen: () => watchCommentsBackdrop.classList.contains('open'),                          close: () => closeWatchComments() },
  { isOpen: () => topbarSearchBar.classList.contains('open'),                                close: () => closeTopbarSearch() }
];

function navCloseTopOverlay(){
  for(const o of NAV_OVERLAYS){
    if(o.isOpen()){ o.close(); return true; }
  }
  return false;
}

// Show the screen a history entry describes (Back/Forward)
async function navApply(target){
  navApplying = true;
  try {
    const feedWatching = feed.classList.contains('watching');

    if(target.screen === 'feed'){
      if(target.watching){
        // Forward into a series
        const i = target.sid ? slides.findIndex(s => s.id === target.sid) : -1;
        if(activeScreenName === 'feed' && feedWatching){
          // already there
        } else if(i !== -1){
          await openSeriesInFeed(i);
        } else {
          showScreen('feed');
        }
      } else {
        // Back out of watching to the browsing feed
        if(feedWatching){ clearPendingResume(); goTo(idx); }
        showScreen('feed');
      }
    } else if(target.screen === 'watch'){
      const i = target.sid ? slides.findIndex(s => s.id === target.sid) : -1;
      if(i !== -1) await openSeriesInFeed(i);
      else showScreen('discover');
    } else {
      showScreen(target.screen);
      // Leave the feed clean for the next visit
      feed.classList.remove('watching', 'paused');
      clearPendingResume();
      // Same refresh as tapping the tab
      if(target.screen === 'discover') refreshContinueWatchingMap().then(renderContinueWatchingBar);
      else if(target.screen === 'library') renderLibraryScreen();
      else if(target.screen === 'profile') renderProfileScreen();
      else if(target.screen === 'history') renderHistoryScreen();
      else if(target.screen === 'membership') renderMembershipScreen();
      else if(target.screen === 'downloads') renderDownloadsScreen();
    }
  } finally {
    navApplying = false;
    navCurrent = target;
  }
}

window.addEventListener('popstate', (e) => {
  const target = e.state;
  if(!target || !target.narrava) return;       // not one of ours

  // Back with an overlay open: close it and push the entry back
  if(navCloseTopOverlay()){
    history.pushState(navCurrent, '');
    return;
  }
  navApply(target);
});
