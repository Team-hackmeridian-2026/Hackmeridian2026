import { useEffect, useRef } from "react";

/**
 * Animated background: a slowly turning DNA double helix whose base pairs are
 * linked like blocks of a chain, over a soft network of drifting "cells".
 *
 * - Canvas 2D, no dependency. Particle count scales with the screen area.
 * - Pointer (mouse or touch) gently pushes cells away and widens the helix nearby.
 * - Pauses when the tab is hidden; draws a single still frame with prefers-reduced-motion.
 * - Fixed behind the content with pointer-events: none, so it never blocks a click.
 * - Colours are read from the theme tokens and follow the light / dark switch.
 */

type Cell = { x: number; y: number; vx: number; vy: number; r: number; bx: number; by: number };
type Palette = { node: string; link: string; accent: string; alpha: number };

const TAU = Math.PI * 2;

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const dark = document.documentElement.dataset.theme !== "light";
  return {
    node: css.getPropertyValue("--color-teal").trim() || "#34d399",
    link: css.getPropertyValue("--color-teal-dark").trim() || "#6ee7b7",
    accent: css.getPropertyValue("--color-lime").trim() || "#a3e635",
    alpha: dark ? 1 : 0.7,
  };
}

export function BioBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let palette = readPalette();
    let width = 0;
    let height = 0;
    let cells: Cell[] = [];
    let linkDistance = 120;
    let frame = 0;
    let last = performance.now();
    let time = 0;
    const pointer = { x: -9999, y: -9999, active: false };

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const small = width < 640;
      linkDistance = small ? 90 : 130;
      const count = Math.round(Math.min(90, Math.max(22, (width * height) / (small ? 14000 : 17000))));
      cells = Array.from({ length: count }, () => {
        const angle = Math.random() * TAU;
        const speed = 0.06 + Math.random() * 0.12;
        const bx = Math.cos(angle) * speed;
        const by = Math.sin(angle) * speed;
        return { x: Math.random() * width, y: Math.random() * height, vx: bx, vy: by, bx, by, r: 1 + Math.random() * 1.6 };
      });
      if (reduced.matches) draw();
    }

    function step(dt: number) {
      for (const c of cells) {
        if (pointer.active) {
          const dx = c.x - pointer.x;
          const dy = c.y - pointer.y;
          const d = Math.hypot(dx, dy);
          if (d < 150 && d > 0.1) {
            const push = (1 - d / 150) * 0.035 * dt;
            c.vx += (dx / d) * push;
            c.vy += (dy / d) * push;
          }
        }
        // Ease back to the cell's own slow drift.
        c.vx += (c.bx - c.vx) * 0.02 * dt;
        c.vy += (c.by - c.vy) * 0.02 * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        if (c.x < -20) c.x = width + 20;
        else if (c.x > width + 20) c.x = -20;
        if (c.y < -20) c.y = height + 20;
        else if (c.y > height + 20) c.y = -20;
      }
    }

    function drawCells() {
      const { node, link, alpha } = palette;
      ctx!.lineWidth = 1;
      ctx!.strokeStyle = link;
      for (let i = 0; i < cells.length; i++) {
        const a = cells[i];
        for (let j = i + 1; j < cells.length; j++) {
          const b = cells[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < linkDistance * linkDistance) {
            ctx!.globalAlpha = (1 - Math.sqrt(d2) / linkDistance) * 0.22 * alpha;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.stroke();
          }
        }
      }
      ctx!.fillStyle = node;
      for (const c of cells) {
        ctx!.globalAlpha = 0.45 * alpha;
        ctx!.beginPath();
        ctx!.arc(c.x, c.y, c.r, 0, TAU);
        ctx!.fill();
      }
    }

    function drawHelix() {
      const { node, link, accent, alpha } = palette;
      const spacing = width < 640 ? 22 : 28;
      const baseAmp = Math.min(70, Math.max(34, height * 0.07));
      const count = Math.ceil(width / spacing) + 2;
      // The helix crosses the screen on a gentle diagonal, low enough to stay behind content.
      const axis = (x: number) => height * 0.74 - (x / width) * height * 0.32;

      let prevA: [number, number] | null = null;
      let prevB: [number, number] | null = null;
      for (let i = 0; i < count; i++) {
        const x = i * spacing - spacing;
        const cy = axis(x);
        let amp = baseAmp;
        if (pointer.active) {
          const d = Math.hypot(x - pointer.x, cy - pointer.y);
          amp *= 1 + 0.7 * Math.exp(-(d * d) / (2 * 140 * 140));
        }
        const phase = i * 0.38 + time * 0.00045;
        const s = Math.sin(phase);
        const depth = Math.cos(phase); // -1 (back) … 1 (front)
        const a: [number, number] = [x, cy + amp * s];
        const b: [number, number] = [x, cy - amp * s];

        // Base pair ("rung").
        ctx!.globalAlpha = 0.16 * alpha;
        ctx!.strokeStyle = link;
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.moveTo(a[0], a[1]);
        ctx!.lineTo(b[0], b[1]);
        ctx!.stroke();

        // Backbones.
        ctx!.lineWidth = 1.6;
        ctx!.globalAlpha = 0.32 * alpha;
        if (prevA && prevB) {
          ctx!.beginPath();
          ctx!.moveTo(prevA[0], prevA[1]);
          ctx!.lineTo(a[0], a[1]);
          ctx!.moveTo(prevB[0], prevB[1]);
          ctx!.lineTo(b[0], b[1]);
          ctx!.stroke();
        }
        prevA = a;
        prevB = b;

        // Every 5th pair is a "block": a small square on the rung, chained to the next one.
        if (i % 5 === 0) {
          const size = 5 + depth * 1.5;
          ctx!.globalAlpha = (0.5 + depth * 0.2) * alpha;
          ctx!.fillStyle = accent;
          ctx!.fillRect(x - size / 2, cy - size / 2, size, size);
        }

        // Nucleotides: bigger and brighter on the front strand.
        ctx!.fillStyle = node;
        ctx!.globalAlpha = (0.35 + 0.25 * depth) * alpha;
        ctx!.beginPath();
        ctx!.arc(a[0], a[1], 2.2 + depth * 0.9, 0, TAU);
        ctx!.fill();
        ctx!.globalAlpha = (0.35 - 0.25 * depth) * alpha;
        ctx!.beginPath();
        ctx!.arc(b[0], b[1], 2.2 - depth * 0.9, 0, TAU);
        ctx!.fill();
      }

      // The chain linking the blocks.
      ctx!.globalAlpha = 0.18 * alpha;
      ctx!.strokeStyle = accent;
      ctx!.setLineDash([3, 5]);
      ctx!.beginPath();
      for (let i = 0; i < count; i += 5) {
        const x = i * spacing - spacing;
        if (i === 0) ctx!.moveTo(x, axis(x));
        else ctx!.lineTo(x, axis(x));
      }
      ctx!.stroke();
      ctx!.setLineDash([]);
    }

    function draw() {
      ctx!.clearRect(0, 0, width, height);
      drawCells();
      drawHelix();
      ctx!.globalAlpha = 1;
    }

    function loop(now: number) {
      const dt = Math.min(48, now - last) / 16.67; // in 60 fps frames, capped after a stall
      last = now;
      time += dt * 16.67;
      step(dt);
      draw();
      frame = requestAnimationFrame(loop);
    }

    function start() {
      cancelAnimationFrame(frame);
      if (reduced.matches || document.hidden) {
        draw();
        return;
      }
      last = performance.now();
      frame = requestAnimationFrame(loop);
    }

    const onPointer = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = true;
    };
    const onLeave = () => {
      pointer.active = false;
    };
    let resizeTimer = 0;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resize, 150);
    };
    const onVisibility = () => (document.hidden ? cancelAnimationFrame(frame) : start());
    const themeObserver = new MutationObserver(() => {
      palette = readPalette();
      if (reduced.matches) draw();
    });

    resize();
    start();
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    reduced.addEventListener("change", start);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(resizeTimer);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      reduced.removeEventListener("change", start);
      themeObserver.disconnect();
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <canvas ref={ref} className="absolute inset-0 size-full opacity-80" />
      {/* Soft veil keeps the reading area calm; the edges stay lively. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_55%_at_50%_38%,color-mix(in_oklab,var(--color-canvas)_70%,transparent)_0%,transparent_100%)]" />
    </div>
  );
}
