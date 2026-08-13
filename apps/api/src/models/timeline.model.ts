// Imported by the browser through the "./timeline" subpath export. No imports,
// no side effects, no Bun/Node globals: reaching this module through index.ts
// would pull hono, zod and — fatally — sharp into the SPA bundle.
//
// Everything the preview and the encoder must agree on lives here. If the two
// ever disagree, the user tunes their sliders against a lie and the taxi ships
// the wrong board.

export const PANEL_WIDTH = 256;
export const PANEL_HEIGHT = 128;

/** Above this the client asks for confirmation. It is a warning, not a refusal. */
export const MAX_RECOMMENDED_FRAMES = 600;

export const FPS_OPTIONS = [8, 10, 12, 15, 20] as const;
export const SCALE_OPTIONS = [1, 0.75, 0.5, 0.25] as const;

export type Fps = (typeof FPS_OPTIONS)[number];
export type Scale = (typeof SCALE_OPTIONS)[number];

// fps and scale are literal unions, not `number`: the wire schema only accepts
// the listed values, and typing them loosely here forces a cast at every
// boundary instead of catching a bad value at the assignment.
export interface Settings {
  displayDuration: number;
  transitionDuration: number;
  fps: Fps;
  scale: Scale;
  gifQuality: number;
  skipSimilarity: number;
}

/**
 * `default` is the value the field starts at (the old `value=` attribute).
 * `emptyFallback` is what a blank or unparseable field becomes at runtime.
 *
 * They differ for transitionDuration, and that is not a typo: the old markup
 * shipped value="0.6" while getSettings() did `parseFloat(v) || 0`, so clearing
 * the field gave 0, not 0.6. The runtime behaviour is what users experienced,
 * so the runtime behaviour is what is preserved.
 */
export const SETTINGS_SPEC = {
  displayDuration: { default: 3, emptyFallback: 3, min: 0.2, step: 0.1, clampMin: 0.1 },
  transitionDuration: { default: 0.6, emptyFallback: 0, min: 0, step: 0.1, clampMin: 0 },
  fps: { default: 12, options: FPS_OPTIONS },
  scale: { default: 1, options: SCALE_OPTIONS },
  gifQuality: { default: 10, emptyFallback: 10, min: 1, max: 50, step: 1 },
  skipSimilarity: { default: 2, emptyFallback: 2, min: 0, max: 100, step: 1 },
} as const;

export const DEFAULT_SETTINGS: Settings = {
  displayDuration: SETTINGS_SPEC.displayDuration.default,
  transitionDuration: SETTINGS_SPEC.transitionDuration.default,
  fps: SETTINGS_SPEC.fps.default,
  scale: SETTINGS_SPEC.scale.default,
  gifQuality: SETTINGS_SPEC.gifQuality.default,
  skipSimilarity: SETTINGS_SPEC.skipSimilarity.default,
};

export function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function lcm(a: number, b: number): number {
  return (a * b) / gcd(a, b);
}

/** Positive modulo — `-1 % 3` is `-1` in JS and we need `2`. */
export function mod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Three cases, and collapsing any two of them changes behaviour:
 *   absent  -> `initial`, the value the old markup started at
 *   blank   -> `emptyFallback`, what getSettings() produced from an empty input
 *   numeric -> itself, INCLUDING zero
 *
 * That last clause is the one deliberate departure from the original. It used
 * `parseFloat(v) || fallback`, so an explicit 0 was falsy and got replaced:
 * typing 0 into "Ignorer trames similaires (%)" silently meant 2 %, even though
 * the field advertised min="0". Reproducing that would make an advertised value
 * unreachable, so zero is honoured here.
 */
function num(value: unknown, initial: number, emptyFallback: number): number {
  if (value === undefined || value === null) return initial;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : emptyFallback;
}

/** Port of the old getSettings(), clamps included. */
export function normalizeSettings(raw: Partial<Record<keyof Settings, unknown>>): Settings {
  const s = SETTINGS_SPEC;
  return {
    displayDuration: Math.max(
      s.displayDuration.clampMin,
      num(raw.displayDuration, s.displayDuration.default, s.displayDuration.emptyFallback),
    ),
    transitionDuration: Math.max(
      s.transitionDuration.clampMin,
      num(raw.transitionDuration, s.transitionDuration.default, s.transitionDuration.emptyFallback),
    ),
    fps: pickOption(num(raw.fps, s.fps.default, s.fps.default), FPS_OPTIONS, s.fps.default),
    scale: pickOption(
      num(raw.scale, s.scale.default, s.scale.default),
      SCALE_OPTIONS,
      s.scale.default,
    ),
    // The old code clamped the low end only; the high end is clamped here
    // because encodeQuality() is meaningless past 50 and the wire schema
    // rejects it anyway.
    gifQuality: Math.min(
      s.gifQuality.max,
      Math.max(
        s.gifQuality.min,
        Math.round(num(raw.gifQuality, s.gifQuality.default, s.gifQuality.emptyFallback)),
      ),
    ),
    skipSimilarity: Math.min(
      s.skipSimilarity.max,
      Math.max(
        s.skipSimilarity.min,
        num(raw.skipSimilarity, s.skipSimilarity.default, s.skipSimilarity.emptyFallback),
      ),
    ),
  };
}

function pickOption<T extends number>(value: number, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

export interface Timeline {
  nRight: number;
  nLeft: number;
  displayDur: number;
  transDur: number;
  fps: number;
  /** One image "slot": how long it is held plus how long it takes to fade out. */
  step: number;
  cycleRight: number;
  cycleLeft: number;
  /** When both panels realign. Zero until both sides have at least one image. */
  totalLoopSeconds: number;
  totalFrames: number;
  frameDelayMs: number;
  panelW: number;
  panelH: number;
  atlasW: number;
  atlasH: number;
  atlasBytes: number;
}

export function computeTimeline(nRight: number, nLeft: number, s: Settings): Timeline {
  const step = s.displayDuration + s.transitionDuration;
  // Co-prime image counts blow the loop up combinatorially — 4 and 5 give
  // lcm 20, which is why the UI advises the same count on both sides.
  const lcmN = nRight && nLeft ? lcm(nRight, nLeft) : 0;
  const totalLoopSeconds = lcmN * step;
  const panelW = Math.max(1, Math.round(PANEL_WIDTH * s.scale));
  const panelH = Math.max(1, Math.round(PANEL_HEIGHT * s.scale));
  const atlasW = panelW * 2;
  const atlasH = panelH * 2;

  return {
    nRight,
    nLeft,
    displayDur: s.displayDuration,
    transDur: s.transitionDuration,
    fps: s.fps,
    step,
    cycleRight: nRight * step,
    cycleLeft: nLeft * step,
    totalLoopSeconds,
    totalFrames: Math.max(1, Math.round(totalLoopSeconds * s.fps)),
    frameDelayMs: Math.round(1000 / s.fps),
    panelW,
    panelH,
    atlasW,
    atlasH,
    atlasBytes: atlasW * atlasH * 4,
  };
}

/** Where a panel is in its own cycle at time `t`, clamped to that cycle. */
export function panelPositionAt(t: number, cycle: number): number {
  return cycle > 0 ? mod(t, cycle) : 0;
}

export interface PanelState {
  idx: number;
  /** Null when nothing is fading in — the held part of the slot. */
  nextIdx: number | null;
  progress: number;
}

/** The cross-fade, resolved once for both the browser canvas and the encoder. */
export function panelStateAt(
  n: number,
  position: number,
  displayDur: number,
  transDur: number,
  step: number,
): PanelState {
  const cycleIndex = Math.floor(position / step);
  const idx = mod(cycleIndex, n);
  const localPos = position - cycleIndex * step;

  if (n > 1 && transDur > 0 && localPos >= displayDur) {
    return {
      idx,
      nextIdx: mod(idx + 1, n),
      progress: clamp01((localPos - displayDur) / transDur),
    };
  }
  return { idx, nextIdx: null, progress: 0 };
}

export type PanelSide = "right" | "left";

/**
 * Diagonal duplication: the taxi roof shows the same board from both sides, so
 * each panel appears twice, on opposite corners. Reordering these four tuples
 * breaks the in-game asset. Coordinates are in panel units.
 */
export const ATLAS_QUADRANTS = [
  { source: "right", x: 0, y: 0 },
  { source: "left", x: 1, y: 0 },
  { source: "left", x: 0, y: 1 },
  { source: "right", x: 1, y: 1 },
] as const satisfies readonly { source: PanelSide; x: number; y: number }[];

/** Below this the quality knob is a no-op and the output stays lossless. */
export const QUALITY_LOSSLESS_MAX = 10;

export interface EncodeQuality {
  colors: number;
  lossy: number;
}

/**
 * gifQuality 1..50, 1 = max quality — the old gif.js scale, where the number was
 * NeuQuant's *sample factor* (how many pixels it looked at when building the
 * palette). palettegen builds a better palette unconditionally, so there is
 * nothing left for a sample factor to control and the knob is remapped to
 * "quality vs size".
 *
 * 1..10 is intentionally flat: the historical default (10) must still produce a
 * full 256-colour, non-lossy GIF, so nobody's existing asset silently degrades.
 */
export function encodeQuality(gifQuality: number): EncodeQuality {
  const q = Math.min(50, Math.max(1, Math.round(gifQuality)));
  if (q <= QUALITY_LOSSLESS_MAX) return { colors: 256, lossy: 0 };
  const t = (q - QUALITY_LOSSLESS_MAX) / (50 - QUALITY_LOSSLESS_MAX);
  return { colors: Math.round(256 - t * 224), lossy: Math.round(t * 100) };
}
