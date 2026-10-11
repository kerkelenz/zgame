/** Browser settings used to be stored under "sf."; copy them to the "zg." names once so nobody is logged out or loses their preferences. Imported first so it runs before anything reads storage. */
try {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith('sf.')) {
      const next = 'zg.' + k.slice(3);
      if (localStorage.getItem(next) === null) localStorage.setItem(next, localStorage.getItem(k) ?? '');
      localStorage.removeItem(k);
    }
  }
} catch { /* storage unavailable */ }
export {};
