// Applies the persisted theme (zustand store "ais-ui") before React renders.
(function () {
  try {
    var raw = window.localStorage.getItem('ais-ui');
    var theme = raw ? JSON.parse(raw).state.theme : 'dark';
    if (theme === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    if (theme !== 'light') theme = 'dark';
    var root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  } catch (e) {
    /* default: dark */
  }
})();
