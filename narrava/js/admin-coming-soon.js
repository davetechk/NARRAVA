// admin-coming-soon.js — shared by admin/user-management.html and
// admin/system-settings.html. Both need real backend work that hasn't
// happened yet, so both are honest placeholders, not broken links —
// same sidebar and topbar as every other admin page, just no fake
// content underneath.

(async () => {
  const page = document.body.dataset.page;
  const title = document.body.dataset.title || 'Coming Soon';
  await requireAdminSession(page);

  document.getElementById('comingSoonBody').innerHTML =
    '<div class="admin-placeholder"><strong>Coming soon</strong>' + escapeHtml(title) + ' isn’t built yet. This is an honest placeholder, not missing functionality — nothing here is broken.</div>';
})();
