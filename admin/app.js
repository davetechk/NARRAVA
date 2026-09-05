document.addEventListener('DOMContentLoaded', () => {
  // --- Sidebar active state, driven by data-page on <body> ---
  const currentPage = document.body.getAttribute('data-page');
  document.querySelectorAll('[data-nav]').forEach(el => {
    if (el.getAttribute('data-nav') === currentPage) {
      el.classList.add('active');
      const parentSub = el.closest('.nav-sub');
      if (parentSub) {
        const parentItem = parentSub.previousElementSibling;
        if (parentItem && parentItem.classList.contains('nav-item')) {
          parentItem.classList.add('active');
        }
      }
    }
  });

  // --- Toggle switches ---
  document.querySelectorAll('.toggle').forEach(t => {
    t.addEventListener('click', () => t.classList.toggle('on'));
  });

  // --- Generic "demo action" buttons (no backend, just visual feedback) ---
  document.querySelectorAll('[data-demo-btn]').forEach(btn => {
    btn.addEventListener('click', () => {
      const original = btn.textContent;
      const flash = btn.getAttribute('data-demo-btn') || 'Done';
      btn.textContent = flash;
      setTimeout(() => { btn.textContent = original; }, 1100);
    });
  });

  // --- Quick search filter (client-side, filters table rows on current page) ---
  const search = document.querySelector('.search-box input');
  const table = document.querySelector('table.data-table');
  if (search && table) {
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      table.querySelectorAll('tbody tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }
});