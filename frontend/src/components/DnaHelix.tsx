import { useEffect, useRef, useState } from "react";
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  NormalBlending,
  PerspectiveCamera,
  Points,
  Scene,
  SRGBColorSpace,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
} from "three";

/**
 * Hero DNA: a double helix drawn with thousands of "0" and "1" digits (life
 * sciences + on-chain data), adapted from the team's Three.js prototype.
 *
 * - Colours come from the theme palette (--color-dna-*): backbones in violet and
 *   pink, base pairs in two halves of yellow / peach / pink / indigo.
 * - Digits near the pointer light up and grow; the helix leans slightly towards it.
 * - No orbit controls (the page must scroll normally) and no bloom pass (too heavy
 *   behind a reading page); the soft glow comes from CSS behind the canvas.
 * - Renders only while visible on screen and in a visible tab; a single still frame
 *   with prefers-reduced-motion. Lazy-loaded so Three.js never delays the page.
 */

const HEIGHT = 1500;
const RADIUS = 150;
const TURNS = 2.6;
const RUNG_SPACING = 34;

function digitTexture(digit: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 56px ui-monospace, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(digit, 32, 35);
  return new CanvasTexture(canvas);
}

type Palette = { strandA: Color; strandB: Color; pairs: Color[]; dark: boolean };

function readPalette(): Palette {
  const dark = document.documentElement.dataset.theme !== "light";
  if (!dark) {
    // Light page: muted mid-tones (no neon on cream), dark enough for the 0s and 1s to read.
    const c = (hex: string) => new Color(hex);
    return {
      strandA: c("#6b60d6"),
      strandB: c("#cf6f98"),
      pairs: ["#c98f2a", "#d9774f", "#c9668f", "#5a50c8", "#857ad8"].map(c),
      dark,
    };
  }
  const css = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => new Color(css.getPropertyValue(`--color-dna-${name}`).trim() || fallback);
  const indigo = get("indigo", "#5a4cf0");
  const violet = get("violet", "#9282f8");
  const pink = get("pink", "#f19cc4");
  const peach = get("peach", "#f6a27d");
  const yellow = get("yellow", "#f2cd6e");
  return { strandA: violet, strandB: pink, pairs: [yellow, peach, pink, indigo, violet], dark };
}

/** Per-theme look: on light pages fewer, larger, tidier digits so each 0 and 1 is legible. */
const LOOK = {
  dark: { perStrand: [2200, 4500], perRung: [12, 18], thickness: 18, jitter: 10, rungJitter: 5, size: [22, 19], alpha: 0.42 },
  light: { perStrand: [1300, 2600], perRung: [10, 13], thickness: 10, jitter: 5, rungJitter: 2, size: [30, 27], alpha: 0.7 },
} as const;

const vertexShader = /* glsl */ `
  uniform vec2 uMouse;
  uniform float uMouseActive;
  uniform float uAspect;
  uniform float uPixelRatio;
  uniform float uSize;
  uniform float uCamZ;
  attribute vec3 aColor;
  attribute float aDigit;
  attribute float aRandom;
  attribute float aKind;
  varying vec3 vColor;
  varying float vDigit;
  varying float vReveal;
  varying float vDepth;
  varying float vKind;
  void main() {
    vKind = aKind;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec4 projected = projectionMatrix * mv;
    vec2 ndc = projected.xy / projected.w;
    float d = distance(ndc * vec2(uAspect, 1.0), uMouse * vec2(uAspect, 1.0));
    vReveal = uMouseActive * (1.0 - smoothstep(0.0, 0.4, d));
    vColor = aColor;
    vDigit = aDigit;
    // 0 at the back of the helix, 1 at the front: back digits fade out a little.
    vDepth = clamp((mv.z + uCamZ + 170.0) / 340.0, 0.0, 1.0);
    // Base pairs (aKind = 1) are drawn a bit larger; digits near the pointer grow so the 0s and 1s become legible.
    gl_PointSize = uSize * (0.6 + aRandom * 0.6) * (1.0 + aKind * 0.35) * (1.0 + vReveal * 1.1) * uPixelRatio * (1000.0 / -mv.z);
    gl_Position = projected;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uZero;
  uniform sampler2D uOne;
  uniform float uBaseAlpha;
  varying vec3 vColor;
  varying float vDigit;
  varying float vReveal;
  varying float vDepth;
  varying float vKind;
  void main() {
    vec4 tex = vDigit < 0.5 ? texture2D(uZero, gl_PointCoord) : texture2D(uOne, gl_PointCoord);
    if (tex.a < 0.3) discard;
    float alpha = uBaseAlpha * (0.3 + 0.7 * vDepth) * (1.0 + vKind * 0.5) + vReveal * 0.4;
    gl_FragColor = vec4(vColor * (1.0 + vReveal * 0.15), tex.a * min(alpha, 1.0));
  }
`;

function buildGeometry(small: boolean, palette: Palette) {
  const look = LOOK[palette.dark ? "dark" : "light"];
  const perStrand = look.perStrand[small ? 0 : 1];
  const perRung = look.perRung[small ? 0 : 1];
  const positions: number[] = [];
  const colors: number[] = [];
  const digits: number[] = [];
  const randoms: number[] = [];
  const kinds: number[] = [];
  const srgb = { r: 0, g: 0, b: 0 };
  const push = (x: number, y: number, z: number, c: Color, kind = 0) => {
    positions.push(x, y, z);
    // The shader writes colours as-is, so hand it sRGB values (Color stores linear ones).
    c.getRGB(srgb, SRGBColorSpace);
    colors.push(srgb.r, srgb.g, srgb.b);
    digits.push(Math.random() > 0.5 ? 1 : 0);
    randoms.push(Math.random());
    kinds.push(kind);
  };

  // Two backbones, slightly thick so they read as tubes.
  for (let i = 0; i < perStrand; i++) {
    const y = (Math.random() - 0.5) * HEIGHT;
    const angle = (y / HEIGHT) * TURNS * Math.PI * 2;
    const r = RADIUS + (Math.random() - 0.5) * look.thickness;
    const jitter = () => (Math.random() - 0.5) * look.jitter;
    push(Math.cos(angle) * r + jitter(), y + jitter(), Math.sin(angle) * r + jitter(), palette.strandA);
    push(-Math.cos(angle) * r + jitter(), y + jitter(), -Math.sin(angle) * r + jitter(), palette.strandB);
  }

  // Base pairs: each rung is two halves of different colours, like A–T / C–G.
  let rung = 0;
  for (let y = -HEIGHT / 2 + RUNG_SPACING / 2; y < HEIGHT / 2; y += RUNG_SPACING, rung++) {
    const angle = (y / HEIGHT) * TURNS * Math.PI * 2;
    const x1 = Math.cos(angle) * RADIUS;
    const z1 = Math.sin(angle) * RADIUS;
    const left = palette.pairs[rung % palette.pairs.length];
    const right = palette.pairs[(rung + 2) % palette.pairs.length];
    for (let j = 0; j < perRung; j++) {
      const t = (j / (perRung - 1)) * 2 - 1; // -1 … 1 across the rung
      const k = () => (Math.random() - 0.5) * look.rungJitter;
      push(x1 * t + k(), y + k(), z1 * t + k(), t < 0 ? left : right, 1);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("aDigit", new Float32BufferAttribute(digits, 1));
  geometry.setAttribute("aRandom", new Float32BufferAttribute(randoms, 1));
  geometry.setAttribute("aKind", new Float32BufferAttribute(kinds, 1));
  return geometry;
}

/**
 * `fill`: instead of the hero framing, the helix runs corner to corner of its box (lean
 * and camera distance follow the box's aspect ratio), for full-page backgrounds.
 */
export default function DnaHelix({ className = "", fill = false }: { className?: string; fill?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "low-power" });
    } catch {
      setFailed(true); // No WebGL: the glows and molecules around still make a decent picture.
      return;
    }
    renderer.setClearColor(0x000000, 0);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const small = canvas.clientWidth < 420;
    let palette = readPalette();

    const scene = new Scene();
    const camera = new PerspectiveCamera(35, 1, 10, 6000);
    camera.position.set(0, 0, 2700);
    const group = new Group();
    group.rotation.z = -0.38; // leans like the Figma helix: bottom left → top right
    scene.add(group);

    const zero = digitTexture("0");
    const one = digitTexture("1");
    let geometry = buildGeometry(small, palette);
    const look = () => LOOK[palette.dark ? "dark" : "light"];
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uMouse: { value: new Vector2(0, 0) },
        uMouseActive: { value: 0 },
        uAspect: { value: 1 },
        uPixelRatio: { value: 1 },
        uSize: { value: look().size[small ? 0 : 1] },
        uCamZ: { value: 2700 },
        uBaseAlpha: { value: look().alpha },
        uZero: { value: zero },
        uOne: { value: one },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: palette.dark ? AdditiveBlending : NormalBlending,
    });
    const points = new Points(geometry, material);
    group.add(points);

    const pointer = { x: 0, y: 0, active: 0 };
    const tilt = { x: 0, y: 0 };
    let start = performance.now();
    let elapsed = 0;

    function resize() {
      const { clientWidth: w, clientHeight: h } = canvas!;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      if (fill) {
        // Corner to corner: lean along the box diagonal and come close enough for the
        // helix to overrun the diagonal by about 10 %.
        const aspect = w / h;
        group.rotation.z = -Math.atan(aspect);
        const visibleHeight = HEIGHT / (1.1 * Math.sqrt(aspect * aspect + 1));
        camera.position.z = visibleHeight / (2 * Math.tan((camera.fov * Math.PI) / 360));
      } else {
        // Keep the whole leaning helix in frame, even in narrow boxes.
        camera.position.z = Math.max(2700, 1600 / (w / h));
      }
      camera.updateProjectionMatrix();
      material.uniforms.uCamZ.value = camera.position.z;
      material.uniforms.uAspect.value = w / h;
      material.uniforms.uPixelRatio.value = dpr;
    }

    function frame(now: number) {
      elapsed += (now - start) / 1000;
      start = now;
      // Ease the pointer influence in and out, and lean the helix towards it.
      material.uniforms.uMouseActive.value += (pointer.active - material.uniforms.uMouseActive.value) * 0.08;
      material.uniforms.uMouse.value.set(pointer.x, pointer.y);
      tilt.x += (pointer.active * pointer.y * 0.12 - tilt.x) * 0.05;
      tilt.y += (pointer.active * pointer.x * 0.25 - tilt.y) * 0.05;
      group.rotation.x = tilt.x;
      points.rotation.y = elapsed * 0.22 + tilt.y;
      renderer.render(scene, camera);
    }

    // Run only when it can be seen.
    let onScreen = true;
    let running = false;
    function update() {
      const shouldRun = onScreen && !document.hidden && !reduced.matches;
      if (shouldRun && !running) {
        start = performance.now();
        renderer.setAnimationLoop(frame);
        running = true;
      } else if (!shouldRun && running) {
        renderer.setAnimationLoop(null);
        running = false;
      }
      if (!shouldRun) frame(performance.now()); // still frame (reduced motion) or last frame
    }

    const onPointer = (e: PointerEvent) => {
      const rect = canvas!.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      pointer.x = x;
      pointer.y = y;
      pointer.active = Math.abs(x) < 1.6 && Math.abs(y) < 1.3 ? 1 : 0;
    };
    const onLeave = () => (pointer.active = 0);
    const onTheme = () => {
      palette = readPalette();
      // Each theme has its own density and colours: rebuild the point cloud.
      geometry.dispose();
      geometry = buildGeometry(small, palette);
      points.geometry = geometry;
      material.uniforms.uSize.value = look().size[small ? 0 : 1];
      material.blending = palette.dark ? AdditiveBlending : NormalBlending;
      material.uniforms.uBaseAlpha.value = look().alpha;
      material.needsUpdate = true;
      if (!running) frame(performance.now());
    };
    const onLost = (e: Event) => {
      e.preventDefault();
      renderer.setAnimationLoop(null);
      running = false;
      setFailed(true);
    };

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (!running) frame(performance.now());
    });
    const visibility = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      update();
    });
    const themeObserver = new MutationObserver(onTheme);

    resize();
    update();
    resizeObserver.observe(canvas);
    visibility.observe(canvas);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    document.addEventListener("visibilitychange", update);
    reduced.addEventListener("change", update);
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      visibility.disconnect();
      themeObserver.disconnect();
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      document.removeEventListener("visibilitychange", update);
      reduced.removeEventListener("change", update);
      canvas.removeEventListener("webglcontextlost", onLost);
      geometry.dispose();
      material.dispose();
      zero.dispose();
      one.dispose();
      renderer.dispose();
    };
  }, [fill]);

  if (failed) return null;
  return <canvas ref={canvasRef} className={`size-full ${className}`} />;
}
