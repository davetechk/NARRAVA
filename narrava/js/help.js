// Help & Feedback screen (markup lives in index.html)

const SUPPORT_EMAIL = 'support@narrava.com';

document.getElementById('helpAppVersion').textContent = APP_VERSION;

document.getElementById('helpCopyEmailBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(SUPPORT_EMAIL);
    showToast('Email copied');
  } catch(err){
    console.error('Narrava: failed to copy support email', err);
    showToast('Couldn’t copy the email. Try again.');
  }
});

document.getElementById('helpBackBtn').addEventListener('click', () => navBack());
