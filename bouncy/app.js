(() => {
  // Reload on the top of each hour (local time) so date-based banner stays fresh.
  (function scheduleHourlyReload() {
    const now = new Date();
    const next = new Date(now);
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    const delay = Math.max(1000, next - now);
    window.setTimeout(() => window.location.reload(), delay);
  })();

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

    const squash = {
      compress: 0.5,
      stretch: 0.08,
      speedForMax: 1400,
      minSpeed: 120,
      recover: 12, // 1/s
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
    const golden = {
      spawnChance: 0.02,
      src: "../golden_stang.svg",
      massMultiplier: 2,
      sparkleIntervalMs: 90,
      sparkleLifeMs: 450,
    };

    let phase = "spawning"; // spawning -> play -> drain
    let phaseStartedAt = null;
    let nextSpawnAt = null;
    let floorEnabled = true;
    let lastT = null;

    /** @type {{el: HTMLImageElement, x: number, y: number, vx: number, vy: number, w: number, h: number, r: number, scale: number, baseW: number, baseH: number, mass: number, invMass: number, squashX: number, squashY: number, originX: number, originY: number, isGolden: boolean, sparkleInterval?: number}[]} */
    const balls = [];

    function measure(ball) {
      const rect = getBounds(ball.el);
      const currentScaleX = Math.abs(ball.scale * ball.squashX) || 1;
      const currentScaleY = Math.abs(ball.scale * ball.squashY) || 1;

      // Prefer layout sizes; fall back to rect / scale to avoid double-scaling when images aren't loaded yet.
      let baseW = ball.el.offsetWidth;
      let baseH = ball.el.offsetHeight;
      if (!baseW || !baseH) {
        baseW = rect.w / currentScaleX;
        baseH = rect.h / currentScaleY;
      }
      if (!baseW || !baseH) {
        baseW = baseW || rect.w;
        baseH = baseH || rect.h;
      }

      ball.baseW = baseW;
      ball.baseH = baseH;
      ball.w = baseW * ball.scale;
      ball.h = baseH * ball.scale;
      ball.r = Math.max(1, Math.max(ball.w, ball.h) * 0.5 * collisionScale);
      ball.mass = Math.max(1, ball.r * ball.r);
      if (ball.isGolden) ball.mass *= golden.massMultiplier;
      ball.invMass = 1 / ball.mass;
    }

    function spawnSparkle(ball) {
      const sparkle = document.createElement("span");
      sparkle.className = "sparkle";
      const size = rand(4, 9);
      const cx = ball.x + ball.w * 0.5;
      const cy = ball.y + ball.h * 0.5;
      const len = Math.max(1, Math.hypot(ball.vx, ball.vy));
      const back = rand(10, 22);
      const jitter = 6;
      const tx =
        cx - (ball.vx / len) * back + rand(-jitter, jitter);
      const ty =
        cy - (ball.vy / len) * back + rand(-jitter, jitter);
      sparkle.style.width = `${size}px`;
      sparkle.style.height = `${size}px`;
      const baseTransform = `translate(${tx}px, ${ty}px)`;
      sparkle.style.transform = baseTransform;
      document.body.appendChild(sparkle);
      sparkle.animate(
        [
          { transform: `${baseTransform} scale(1)`, opacity: 1 },
          { transform: `${baseTransform} scale(0.4)`, opacity: 0 },
        ],
        {
          duration: golden.sparkleLifeMs,
          easing: "ease-out",
          fill: "forwards",
        }
      );
      window.setTimeout(() => sparkle.remove(), golden.sparkleLifeMs + 80);
    }

    function startSparkles(ball) {
      if (!ball.isGolden) return;
      if (ball.sparkleInterval != null) clearInterval(ball.sparkleInterval);
      ball.sparkleInterval = window.setInterval(
        () => spawnSparkle(ball),
        golden.sparkleIntervalMs
      );
    }

    function renderBall(ball) {
      const sx = ball.scale * ball.squashX;
      const sy = ball.scale * ball.squashY;
      ball.el.style.transformOrigin = `${(ball.originX * 100).toFixed(1)}% ${(ball.originY * 100).toFixed(1)}%`;
      ball.el.style.transform = `translate3d(${ball.x}px, ${ball.y}px, 0) scale(${sx}, ${sy})`;
    }

    function relaxSquash(ball, dt) {
      const decay = Math.exp(-squash.recover * dt);
      ball.squashX = 1 + (ball.squashX - 1) * decay;
      ball.squashY = 1 + (ball.squashY - 1) * decay;
      ball.originX = 0.5 + (ball.originX - 0.5) * decay;
      ball.originY = 0.5 + (ball.originY - 0.5) * decay;
    }

    function applySquash(ball, nx, ny, impactSpeed) {
      if (impactSpeed < squash.minSpeed) return;
      const strength = Math.min(1, impactSpeed / squash.speedForMax);
      if (strength <= 0) return;
      const compress = 1 - squash.compress * strength;
      const stretch = 1 + squash.stretch * strength;
      if (Math.abs(nx) >= Math.abs(ny)) {
        ball.originX = nx > 0 ? 0 : 1;
        ball.originY = 0.5;
      } else {
        ball.originY = ny > 0 ? 0 : 1;
        ball.originX = 0.5;
      }
      if (Math.abs(nx) >= Math.abs(ny)) {
        ball.squashX = Math.min(ball.squashX, compress);
        ball.squashY = Math.max(ball.squashY, stretch);
      } else {
        ball.squashY = Math.min(ball.squashY, compress);
        ball.squashX = Math.max(ball.squashX, stretch);
      }
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
        const impactSpeed = Math.abs(ball.vx);
        ball.vx = -ball.vx * physics.restitution;
        ball.vy *= physics.wallFriction;
        applySquash(ball, 1, 0, impactSpeed);
      } else if (ball.x > maxX) {
        ball.x = maxX;
        const impactSpeed = Math.abs(ball.vx);
        ball.vx = -ball.vx * physics.restitution;
        ball.vy *= physics.wallFriction;
        applySquash(ball, -1, 0, impactSpeed);
      }

      if (ball.y < 0 && ball.vy < 0) {
        ball.y = 0;
        const impactSpeed = Math.abs(ball.vy);
        ball.vy = -ball.vy * physics.restitution;
        ball.vx *= physics.wallFriction;
        applySquash(ball, 0, 1, impactSpeed);
      } else if (floorEnabled && ball.y > maxY) {
        ball.y = maxY;
        const impactSpeed = Math.abs(ball.vy);
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
        applySquash(ball, 0, -1, impactSpeed);
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

          const totalInvMass = a.invMass + b.invMass;
          if (totalInvMass === 0) continue;
          const correction = overlap / totalInvMass;
          a.x -= nx * correction * a.invMass;
          a.y -= ny * correction * a.invMass;
          b.x += nx * correction * b.invMass;
          b.y += ny * correction * b.invMass;

          const rvx = b.vx - a.vx;
          const rvy = b.vy - a.vy;
          const velAlongNormal = rvx * nx + rvy * ny;
          if (velAlongNormal > 0) continue;

          const impactSpeed = Math.abs(velAlongNormal);
          applySquash(a, nx, ny, impactSpeed);
          applySquash(b, -nx, -ny, impactSpeed);

          const impulse =
            (-(1 + physics.restitution) * velAlongNormal) / totalInvMass;
          const ix = impulse * nx;
          const iy = impulse * ny;
          a.vx -= ix * a.invMass;
          a.vy -= iy * a.invMass;
          b.vx += ix * b.invMass;
          b.vy += iy * b.invMass;
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
        mass: 1,
        invMass: 1,
        squashX: 1,
        squashY: 1,
        originX: 0.5,
        originY: 0.5,
        isGolden: false,
        sparkleInterval: null,
      };
      ball.scale = 1 + rand(-sizeJitter, sizeJitter);

      ball.isGolden = Math.random() < golden.spawnChance;
      if (ball.isGolden) {
        el.src = golden.src;
        el.classList.add("golden");
        startSparkles(ball);
      } else {
        el.classList.remove("golden");
      }

      renderBall(ball);
      measure(ball);

      const vw = window.innerWidth;
      ball.x = rand(0, Math.max(0, vw - ball.w));
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
      if (ball.sparkleInterval != null) {
        clearInterval(ball.sparkleInterval);
      }
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
        if (balls.length < show.maxBalls && t >= nextSpawnAt) {
          spawnBall();
          nextSpawnAt = t + show.spawnIntervalMs;
        }
        if (balls.length >= show.maxBalls) startPhase("play", t);
      } else if (phase === "play") {
        if (t - phaseStartedAt >= show.playDurationMs) startPhase("drain", t);
      }

      for (const ball of balls) {
        stepBall(ball, dt);
        relaxSquash(ball, dt);
      }
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
