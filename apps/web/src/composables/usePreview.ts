import {
  ATLAS_QUADRANTS,
  frameIndexAt,
  mod,
  panelPositionAt,
  panelStateAt,
} from "@taxipannel/api/timeline";
import { markRaw, onBeforeUnmount, type Ref, shallowRef, watch } from "vue";
import { type GalleryItem, useGalleries } from "./useGalleries";
import { useSettings } from "./useSettings";

export type PreviewView = "atlas" | "right" | "left";

/**
 * Per-instance, NOT a singleton: it owns a rAF handle bound to one specific
 * <canvas>, so a second preview must not share its state.
 */
export function usePreview(canvasRef: Ref<HTMLCanvasElement | null>) {
  const { right, left } = useGalleries();
  const { timeline, ready } = useSettings();

  const reduceMotion =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const playing = shallowRef(!reduceMotion);
  const position = shallowRef(0);
  const view = shallowRef<PreviewView>("atlas");

  // Offscreen scratch, never reactive: a canvas behind a Proxy is not a valid
  // CanvasImageSource and drawImage() throws on it.
  const scratch = markRaw(document.createElement("canvas"));
  const scratchCtx = markRaw(scratch.getContext("2d", { alpha: true })!);
  const panels = markRaw({
    right: document.createElement("canvas"),
    left: document.createElement("canvas"),
  });

  let raf = 0;
  let originMs = performance.now();

  /** Same rule as the encoder: animated sources run on the absolute loop clock. */
  function frameOf(item: GalleryItem, clock: number): ImageBitmap {
    return item.frames[frameIndexAt(item.timing, clock)] ?? item.frames[0]!;
  }

  function drawPanel(
    target: HTMLCanvasElement,
    items: readonly GalleryItem[],
    pos: number,
    clock: number,
    w: number,
    h: number,
  ): void {
    const tl = timeline.value;
    const { idx, nextIdx, progress } = panelStateAt(
      items.length,
      pos,
      tl.displayDur,
      tl.transDur,
      tl.step,
    );

    scratch.width = w;
    scratch.height = h;
    scratchCtx.clearRect(0, 0, w, h);
    scratchCtx.globalAlpha = 1;
    scratchCtx.drawImage(frameOf(items[idx]!, clock), 0, 0, w, h);
    if (nextIdx !== null) {
      scratchCtx.globalAlpha = progress;
      scratchCtx.drawImage(frameOf(items[nextIdx]!, clock), 0, 0, w, h);
      scratchCtx.globalAlpha = 1;
    }

    target.width = w;
    target.height = h;
    target.getContext("2d")!.drawImage(scratch, 0, 0);
  }

  function render(): void {
    const canvas = canvasRef.value;
    const r = right.value;
    const l = left.value;
    if (!canvas || r.length === 0 || l.length === 0) return;

    const tl = timeline.value;
    const t = position.value;

    drawPanel(panels.right, r, panelPositionAt(t, tl.cycleRight), t, tl.panelW, tl.panelH);
    drawPanel(panels.left, l, panelPositionAt(t, tl.cycleLeft), t, tl.panelW, tl.panelH);

    const single = view.value !== "atlas";
    canvas.width = single ? tl.panelW : tl.atlasW;
    canvas.height = single ? tl.panelH : tl.atlasH;

    const ctx = canvas.getContext("2d", { alpha: false })!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (single) {
      ctx.drawImage(view.value === "right" ? panels.right : panels.left, 0, 0);
      return;
    }
    // The one table, imported from the API package. If this ever disagrees with
    // the server, the taxi shows the wrong board.
    for (const q of ATLAS_QUADRANTS) {
      ctx.drawImage(
        q.source === "right" ? panels.right : panels.left,
        q.x * tl.panelW,
        q.y * tl.panelH,
      );
    }
  }

  function tick(now: number): void {
    const loop = timeline.value.totalLoopSeconds;
    if (playing.value && loop > 0) position.value = mod((now - originMs) / 1000, loop);
    render();
    raf = requestAnimationFrame(tick);
  }

  function seek(seconds: number): void {
    position.value = seconds;
    // Rebase the clock so pause-at-4.2s then play continues at 4.2s rather
    // than jumping to wherever wall-clock time has got to.
    originMs = performance.now() - seconds * 1000;
  }

  function toggle(): void {
    playing.value = !playing.value;
  }

  watch(playing, (on) => {
    if (on) originMs = performance.now() - position.value * 1000;
  });

  // Changing the loop length or the images invalidates the current position.
  watch([() => timeline.value.totalLoopSeconds, right, left], () => seek(0));

  raf = requestAnimationFrame(tick);
  onBeforeUnmount(() => cancelAnimationFrame(raf));

  return { playing, position, view, ready, seek, toggle };
}
