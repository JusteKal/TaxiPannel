// The pixel work, as plain typed-array loops.
//
// sharp has no globalAlpha; the closest is composite({blend:"over"}) after
// pre-multiplying the overlay's alpha in a separate pass — three libvips
// pipelines per panel per frame, each crossing the napi boundary. At 600 frames
// that is 3600 round trips for an operation that is one fused multiply-add per
// byte over a 128 KiB buffer.

import { ATLAS_QUADRANTS, panelPositionAt, panelStateAt, type Timeline } from "./timeline.model";

/** One panel's sources, already resized to panelW x panelH and flattened to RGBA. */
export interface PanelSource {
  images: readonly Uint8Array[];
  /** True when every source image is fully opaque — selects the fast blend path. */
  opaque: boolean;
}

/** Scratch buffers reused across every frame of a run. */
export interface ComposeScratch {
  right: Uint8Array;
  left: Uint8Array;
}

export function makeScratch(timeline: Timeline): ComposeScratch {
  const bytes = timeline.panelW * timeline.panelH * 4;
  return { right: new Uint8Array(bytes), left: new Uint8Array(bytes) };
}

/** Canvas `globalAlpha` + source-over on straight (unpremultiplied) RGBA. */
export function blendOver(
  dst: Uint8Array,
  src: Uint8Array,
  alpha: number,
  bothOpaque: boolean,
): void {
  if (alpha <= 0) return;

  // Both layers opaque — the overwhelmingly common case — collapses to a lerp.
  if (bothOpaque) {
    const a = alpha;
    const inv = 1 - a;
    for (let i = 0; i < dst.length; i += 4) {
      dst[i] = Math.round(src[i]! * a + dst[i]! * inv);
      dst[i + 1] = Math.round(src[i + 1]! * a + dst[i + 1]! * inv);
      dst[i + 2] = Math.round(src[i + 2]! * a + dst[i + 2]! * inv);
      dst[i + 3] = 255;
    }
    return;
  }

  for (let i = 0; i < dst.length; i += 4) {
    const sa = (src[i + 3]! / 255) * alpha;
    if (sa === 0) continue;
    const da = dst[i + 3]! / 255;
    const oa = sa + da * (1 - sa);
    if (oa === 0) {
      dst[i] = 0;
      dst[i + 1] = 0;
      dst[i + 2] = 0;
      dst[i + 3] = 0;
      continue;
    }
    const keep = da * (1 - sa);
    dst[i] = Math.round((src[i]! * sa + dst[i]! * keep) / oa);
    dst[i + 1] = Math.round((src[i + 1]! * sa + dst[i + 1]! * keep) / oa);
    dst[i + 2] = Math.round((src[i + 2]! * sa + dst[i + 2]! * keep) / oa);
    dst[i + 3] = Math.round(oa * 255);
  }
}

/** Port of the old composePanelFrame(); `out` is panelW * panelH * 4 bytes. */
export function composePanelFrame(
  out: Uint8Array,
  panel: PanelSource,
  position: number,
  displayDur: number,
  transDur: number,
  step: number,
): void {
  const { idx, nextIdx, progress } = panelStateAt(
    panel.images.length,
    position,
    displayDur,
    transDur,
    step,
  );
  out.set(panel.images[idx]!);
  if (nextIdx !== null) blendOver(out, panel.images[nextIdx]!, progress, panel.opaque);
}

/** One quadrant blit: row-wise set() — the memcpy the old drawImage() was. */
export function blitQuadrant(
  atlas: Uint8Array,
  atlasW: number,
  panel: Uint8Array,
  panelW: number,
  panelH: number,
  quadX: number,
  quadY: number,
): void {
  const srcRow = panelW * 4;
  const dstRow = atlasW * 4;
  const dx = quadX * panelW * 4;
  for (let y = 0; y < panelH; y++) {
    atlas.set(panel.subarray(y * srcRow, y * srcRow + srcRow), (quadY * panelH + y) * dstRow + dx);
  }
}

/** Renders frame `frameIndex` of the loop into `atlas`. */
export function renderAtlasAt(
  atlas: Uint8Array,
  frameIndex: number,
  timeline: Timeline,
  right: PanelSource,
  left: PanelSource,
  scratch: ComposeScratch,
): void {
  const { fps, step, displayDur, transDur, cycleRight, cycleLeft, panelW, panelH, atlasW } =
    timeline;
  const t = frameIndex / fps;

  composePanelFrame(
    scratch.right,
    right,
    panelPositionAt(t, cycleRight),
    displayDur,
    transDur,
    step,
  );
  composePanelFrame(scratch.left, left, panelPositionAt(t, cycleLeft), displayDur, transDur, step);

  for (const q of ATLAS_QUADRANTS) {
    const panel = q.source === "right" ? scratch.right : scratch.left;
    blitQuadrant(atlas, atlasW, panel, panelW, panelH, q.x, q.y);
  }
}

/** Every 8th pixel, exact byte compare — the old computeChangedRatio(), verbatim. */
const SAMPLE_STEP = 8;

export function changedRatio(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) return 1;
  let changed = 0;
  let sampled = 0;
  for (let i = 0; i < a.length; i += 4 * SAMPLE_STEP) {
    sampled++;
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) {
      changed++;
    }
  }
  return changed / Math.max(1, sampled);
}
