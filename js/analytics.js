// Anonymous usage counts via GoatCounter (no cookies, no personal data).
// Set GOATCOUNTER_CODE to your site code (the "xxx" in xxx.goatcounter.com) to turn it on.
(function () {
  const GOATCOUNTER_CODE = 'dermnetnzflashcards';

  window.track = function () {};
  if (!GOATCOUNTER_CODE || /^(localhost|127\.|\[::1\])/.test(location.hostname)) return;

  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.dataset.goatcounter = 'https://' + GOATCOUNTER_CODE + '.goatcounter.com/count';
  document.head.appendChild(s);

  // Counts an action by name only (e.g. "start", "rate"); never card or answer content.
  window.track = function (name) {
    if (window.goatcounter && window.goatcounter.count) {
      window.goatcounter.count({ path: 'click/' + name, title: name, event: true });
    }
  };
})();
