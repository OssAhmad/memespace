// Runs before styles are loaded to avoid a flash of the opposite theme.
(() => {
  let saved;
  try { saved = localStorage.getItem('memespace-theme'); } catch {}
  const theme = ['light','dark'].includes(saved) ? saved : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
})();
