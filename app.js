(() => {
  // Refresh periodically so date-based banner updates without manual reload.
  // 4 hours = 4 * 60 * 60 * 1000 ms
  window.setTimeout(() => window.location.reload(), 4 * 60 * 60 * 1000);

  const logo = document.getElementById("logo");
  const banner = document.getElementById("date-banner");

  // Dict: keys are MM-DD (local date), values are the banner text.
  const messagesByDate = window.STANG_MESSAGES_BY_DATE ?? {};

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function formatLocalDateMMDD(d) {
    return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function setBannerForToday() {
    const key = formatLocalDateMMDD(new Date());
    const message = messagesByDate[key] ?? messagesByDate.default ?? "";
    if (!message) {
      banner.hidden = true;
      banner.textContent = "";
      return;
    }
    banner.textContent = message;
    banner.hidden = false;
  }

  function getBannerHeight() {
    if (banner.hidden) return 0;
    return banner.getBoundingClientRect().height;
  }

  setBannerForToday();

  const reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function sign() {
    return Math.random() < 0.5 ? -1 : 1;
  }

  function getBounds(el) {
    const rect = el.getBoundingClientRect();
    return { w: rect.width, h: rect.height };
  }

  function startArcade() {
    let x = 0;
    let y = 0;
    let vx = 260;
    let vy = 190;
    let lastT = null;

    function clampPosToViewport() {
      const { w, h } = getBounds(logo);
      const vw = window.innerWidth;
      const vh = Math.max(0, window.innerHeight - getBannerHeight());
      x = Math.max(0, Math.min(vw - w, x));
      y = Math.max(0, Math.min(vh - h, y));
    }

    function render() {
      logo.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }

    function bounceArcade() {
      const { w, h } = getBounds(logo);
      const vw = window.innerWidth;
      const vh = Math.max(0, window.innerHeight - getBannerHeight());

      if (x <= 0) {
        x = 0;
        vx = Math.abs(vx);
      } else if (x + w >= vw) {
        x = vw - w;
        vx = -Math.abs(vx);
      }

      if (y <= 0) {
        y = 0;
        vy = Math.abs(vy);
      } else if (y + h >= vh) {
        y = vh - h;
        vy = -Math.abs(vy);
      }
    }

    function tick(t) {
      if (lastT == null) lastT = t;
      const dt = Math.min(0.05, (t - lastT) / 1000);
      lastT = t;

      x += vx * dt;
      y += vy * dt;
      bounceArcade();
      render();

      requestAnimationFrame(tick);
    }

    function init() {
      const { w, h } = getBounds(logo);
      const vw = window.innerWidth;
      const vh = Math.max(0, window.innerHeight - getBannerHeight());

      x = rand(0, Math.max(0, vw - w));
      y = rand(0, Math.max(0, vh - h));
      vx = rand(220, 360) * sign();
      vy = rand(160, 300) * sign();

      render();
      if (!reduceMotion) requestAnimationFrame(tick);
    }

    window.addEventListener("resize", () => {
      clampPosToViewport();
      render();
    });

    logo.addEventListener("load", init, { once: true });
    if (logo.complete) init();
  }

  startArcade();
})();
