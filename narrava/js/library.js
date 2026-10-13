// Library tab: series the signed-in viewer saved

const libraryBody = document.getElementById('libraryBody');

async function renderLibraryScreen(){
  showSkeletonLogo();
  libraryBody.innerHTML = '<div class="library-grid">' + skeletonPosterGridHtml(8) + '</div>';

  const [savedIds] = await Promise.all([fetchMySavedSeriesIds(), slidesReady]);

  if(savedIds === null){
    hideSkeletonLogo();
    libraryBody.innerHTML =
      '<div class="discover-empty">Sign in to see the series you’ve saved.<br>' +
      '<button type="button" class="pill-cta-btn" id="libraryLoginBtn">Log in</button>' +
      '</div>';
    document.getElementById('libraryLoginBtn').addEventListener('click', () => openAuthModal('login'));
    return;
  }

  // Keep the order of `slides`
  const list = slides.filter(s => savedIds.has(s.id));

  if(list.length === 0){
    hideSkeletonLogo();
    libraryBody.innerHTML = '<div class="discover-empty">Nothing saved yet. Tap the bookmark on a series to save it.</div>';
    return;
  }

  libraryBody.innerHTML = '<div class="library-grid">' + list.map(s => posterCardHtml(s, false)).join('') + '</div>';
  libraryBody.querySelectorAll('.poster-card').forEach(card => {
    card.addEventListener('click', () => openSeriesInFeed(parseInt(card.dataset.slideIndex, 10)));
  });
  hideSkeletonLogo();
}
