// library.js
//
// The Library tab: every series the signed-in viewer has actually saved
// — fetchMySavedSeriesIds (social.js) is the one real source, straight
// off series_saves, the same table the save/bookmark button everywhere
// else in this app already reads and writes (toggleSeriesSave). No
// second way of reading or writing that table is built here.
//
// Two honest empty states, never the same one: signed out gets a real
// sign-in prompt (nothing to show yet, not "nothing saved"); signed in
// with nothing saved says so plainly. Re-fetched fresh every time this
// tab is opened (renderLibraryScreen), same pattern as profile.js's own
// renderProfileScreen, rather than trusting a possibly-stale snapshot
// from earlier in the session.
//
// A saved card reuses discover.js's own posterCardHtml (its own
// data-slide-index into the shared `slides` array) and app.js's
// openSeriesInFeed — the exact same real navigation every other poster
// in this app already uses, not a second one built for this tab.

const libraryBody = document.getElementById('libraryBody');

async function renderLibraryScreen(){
  libraryBody.innerHTML = narravaLoaderHtml('pulse', 'Loading your library…');

  const [savedIds] = await Promise.all([fetchMySavedSeriesIds(), slidesReady]);

  if(savedIds === null){
    libraryBody.innerHTML =
      '<div class="discover-empty">Sign in to see the series you’ve saved.<br>' +
      '<button type="button" class="pill-cta-btn" id="libraryLoginBtn">Log in</button>' +
      '</div>';
    document.getElementById('libraryLoginBtn').addEventListener('click', () => openAuthModal('login'));
    return;
  }

  // Preserves `slides`' own real order (whatever fetchSlides returned)
  // rather than inventing a "recently saved" ranking series_saves' own
  // columns were never confirmed to support.
  const list = slides.filter(s => savedIds.has(s.id));

  if(list.length === 0){
    libraryBody.innerHTML = '<div class="discover-empty">You haven’t saved any series yet — tap the bookmark icon on a series to add it here.</div>';
    return;
  }

  libraryBody.innerHTML = '<div class="library-grid">' + list.map(s => posterCardHtml(s, false)).join('') + '</div>';
  libraryBody.querySelectorAll('.poster-card').forEach(card => {
    card.addEventListener('click', () => openSeriesInFeed(parseInt(card.dataset.slideIndex, 10)));
  });
}
