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

  function startPhysicsShow() {
    const physics = {
      gravity: 1400, // px/s^2
      airDrag: 0.01, // 1/s (higher = more damping)
      restitution: 0.95, // bounce "bounciness"
      wallFriction: 0.9995, // tangential damping on impacts
      minBounceVy: 300, // keep balls lively off the floor
      minBounceJitter: 180,
      floorKickVx: 80,
      floorBoostVy: 120, // extra upward push on floor hits
    };

    const spawnVelocity = {
      x: 900, // px/s
      y: 900, // px/s
      xJitter: 220,
      yJitter: 120,
    };

    const show = {
      spawnIntervalMs: 15_000,
      maxBalls: 15,
      playDurationMs: 60_000,
    };

    const sizeJitter = 0.25; // +/- 25%
    const collisionScale = 1; // 1 = use scaled box size for collisions

    let phase = "spawning"; // spawning -> play -> drain
    let phaseStartedAt = null;
    let nextSpawnAt = null;
    let floorEnabled = true;
    let lastT = null;

    /** @type {{el: HTMLImageElement, x: number, y: number, vx: number, vy: number, w: number, h: number, r: number, scale: number, baseW: number, baseH: number}[]} */
    const balls = [];

    function measure(ball) {
      const baseW = ball.el.offsetWidth || getBounds(ball.el).w;
      const baseH = ball.el.offsetHeight || getBounds(ball.el).h;
      ball.baseW = baseW;
      ball.baseH = baseH;
      ball.w = baseW * ball.scale;
      ball.h = baseH * ball.scale;
      ball.r = Math.max(1, Math.max(ball.w, ball.h) * 0.5 * collisionScale);
    }

    function renderBall(ball) {
      ball.el.style.transform = `translate3d(${ball.x}px, ${ball.y}px, 0) scale(${ball.scale})`;
    }

    function getPlayBounds(ball) {
      const vw = window.innerWidth;
      const vh = Math.max(0, window.innerHeight - getBannerHeight());
      return {
        maxX: Math.max(0, vw - ball.w),
        maxY: Math.max(0, vh - ball.h),
        screenBottom: window.innerHeight + ball.h + 80,
      };
    }

    function collideWalls(ball) {
      const { maxX, maxY } = getPlayBounds(ball);

      if (ball.x < 0) {
        ball.x = 0;
        ball.vx = -ball.vx * physics.restitution;
        ball.vy *= physics.wallFriction;
      } else if (ball.x > maxX) {
        ball.x = maxX;
        ball.vx = -ball.vx * physics.restitution;
        ball.vy *= physics.wallFriction;
      }

      if (ball.y < 0 && ball.vy < 0) {
        ball.y = 0;
        ball.vy = -ball.vy * physics.restitution;
        ball.vx *= physics.wallFriction;
      } else if (floorEnabled && ball.y > maxY) {
        ball.y = maxY;
        ball.vy = -ball.vy * physics.restitution;
        ball.vx *= physics.wallFriction;
        if (phase !== "drain") {
          ball.vy -= physics.floorBoostVy;
          if (Math.abs(ball.vy) < physics.minBounceVy) {
            ball.vy = -(
              physics.minBounceVy + rand(0, physics.minBounceJitter)
            );
          }
          ball.vx += rand(-physics.floorKickVx, physics.floorKickVx);
        }
      }
    }

    function stepBall(ball, dt) {
      ball.vy += physics.gravity * dt;
      const drag = Math.exp(-physics.airDrag * dt);
      ball.vx *= drag;
      ball.vy *= drag;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
    }

    function resolveBallCollisions() {
      for (let i = 0; i < balls.length; i++) {
        const a = balls[i];
        const ax = a.x + a.w / 2;
        const ay = a.y + a.h / 2;
        for (let j = i + 1; j < balls.length; j++) {
          const b = balls[j];
          const bx = b.x + b.w / 2;
          const by = b.y + b.h / 2;
          let dx = bx - ax;
          let dy = by - ay;
          let dist = Math.hypot(dx, dy);
          const minDist = a.r + b.r;
          if (dist >= minDist) continue;
          if (dist === 0) {
            dist = 0.001;
            dx = 1;
            dy = 0;
          }
          const nx = dx / dist;
          const ny = dy / dist;
          const overlap = minDist - dist;

          a.x -= nx * overlap * 0.5;
          a.y -= ny * overlap * 0.5;
          b.x += nx * overlap * 0.5;
          b.y += ny * overlap * 0.5;

          const rvx = b.vx - a.vx;
          const rvy = b.vy - a.vy;
          const velAlongNormal = rvx * nx + rvy * ny;
          if (velAlongNormal > 0) continue;

          const impulse = (-(1 + physics.restitution) * velAlongNormal) / 2;
          const ix = impulse * nx;
          const iy = impulse * ny;
          a.vx -= ix;
          a.vy -= iy;
          b.vx += ix;
          b.vy += iy;
        }
      }
    }

    function spawnBall() {
      /** @type {HTMLImageElement} */
      const el = logo.cloneNode(true);
      el.removeAttribute("id");
      el.alt = "";
      el.setAttribute("aria-hidden", "true");
      el.style.display = "";
      document.body.appendChild(el);

      const ball = {
        el,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        w: 0,
        h: 0,
        r: 0,
        scale: 1,
        baseW: 0,
        baseH: 0,
      };
      ball.scale = 1 + rand(-sizeJitter, sizeJitter);
      renderBall(ball);
      measure(ball);

      const vw = window.innerWidth;
      ball.x = Math.max(0, Math.floor(vw / 2 - ball.w / 2));
      ball.y = -ball.h - 40;
      ball.vx =
        (spawnVelocity.x +
          rand(-spawnVelocity.xJitter, spawnVelocity.xJitter)) *
        sign();
      ball.vy =
        spawnVelocity.y + rand(-spawnVelocity.yJitter, spawnVelocity.yJitter);

      renderBall(ball);
      balls.push(ball);
    }

    function despawnBall(i) {
      const ball = balls[i];
      ball.el.remove();
      balls.splice(i, 1);
    }

    function startPhase(next, t) {
      phase = next;
      phaseStartedAt = t;
      if (phase === "spawning") {
        floorEnabled = true;
        nextSpawnAt = t;
      } else if (phase === "play") {
        floorEnabled = true;
      } else if (phase === "drain") {
        floorEnabled = false;
      }
    }

    function tick(t) {
      if (lastT == null) lastT = t;
      const dt = Math.min(0.05, (t - lastT) / 1000);
      lastT = t;

      if (phaseStartedAt == null) startPhase("spawning", t);
      if (nextSpawnAt == null) nextSpawnAt = t;

      if (phase === "spawning") {
        while (balls.length < show.maxBalls && t >= nextSpawnAt) {
          spawnBall();
          nextSpawnAt += show.spawnIntervalMs;
        }
        if (balls.length >= show.maxBalls) startPhase("play", t);
      } else if (phase === "play") {
        if (t - phaseStartedAt >= show.playDurationMs) startPhase("drain", t);
      }

      for (const ball of balls) stepBall(ball, dt);
      resolveBallCollisions();
      for (const ball of balls) collideWalls(ball);

      for (let i = balls.length - 1; i >= 0; i--) {
        const ball = balls[i];
        const { screenBottom } = getPlayBounds(ball);
        if (phase === "drain" && ball.y > screenBottom) {
          despawnBall(i);
          continue;
        }
        renderBall(ball);
      }

      if (phase === "drain" && balls.length === 0) startPhase("spawning", t);

      requestAnimationFrame(tick);
    }

    function handleResize() {
      for (const ball of balls) {
        measure(ball);
        const { maxX, maxY } = getPlayBounds(ball);
        ball.x = Math.max(0, Math.min(maxX, ball.x));
        if (floorEnabled) ball.y = Math.min(maxY, ball.y);
        renderBall(ball);
      }
    }

    window.addEventListener("resize", handleResize);

    logo.style.display = "none";
    if (!reduceMotion) requestAnimationFrame(tick);
  }

  function init() {
    if (reduceMotion) return;
    startPhysicsShow();
  }

  logo.addEventListener("load", init, { once: true });
  if (logo.complete) init();
})();
