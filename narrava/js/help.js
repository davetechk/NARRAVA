// help.js
//
// The Help & Feedback screen (Profile -> Help & Feedback). Built like
// History (history.js): same .library shell, header and back arrow. Its
// content is static markup in index.html — this file only wires it:
//
//   Privacy Policy  a plain link to privacy.html, opened in a new tab.
//                   That page is standalone static HTML and never runs
//                   any app code (see DOCUMENTATION.md).
//   Contact         support@narrava.com — a mailto link (subject
//                   "Narrava support") and a Copy button confirmed with
//                   the shared toast.
//   About           name, one-line description, APP_VERSION
//                   (shared-utils.js — the one place the version lives)
//                   and the copyright line.

const SUPPORT_EMAIL = 'support@narrava.com';

document.getElementById('helpAppVersion').textContent = APP_VERSION;

document.getElementById('helpCopyEmailBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(SUPPORT_EMAIL);
    showToast('Email copied');
  } catch(err){
    console.error('Narrava: failed to copy support email', err);
    showToast('Could not copy email — please try again');
  }
});

// Same as the browser's own Back (nav.js) — returns to Profile.
document.getElementById('helpBackBtn').addEventListener('click', () => navBack());
