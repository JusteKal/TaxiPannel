import { markRaw, shallowRef } from "vue";
import { ApiError, deleteAsset, uploadAsset } from "../api/client";
import { prettyBytes } from "../utils/format";
import { useAlerts } from "./useAlerts";

export type PanelSide = "right" | "left";

export interface GalleryItem {
  /** Local id. Distinct from `assetId`, which only exists once the upload lands. */
  id: string;
  assetId: string | null;
  name: string;
  /** Object URL for the <img> thumbnail. Exactly one revoke per create. */
  url: string;
  /** markRaw'd — a Proxy-wrapped ImageBitmap is not a valid CanvasImageSource. */
  bitmap: ImageBitmap;
  state: "uploading" | "ready" | "failed";
}

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

// shallowRef, and every mutation REASSIGNS the array. Deep-tracking N
// thumbnails and re-running dependency bookkeeping at 60 fps is pure waste,
// and the preview reads these on every animation frame.
const right = shallowRef<GalleryItem[]>([]);
const left = shallowRef<GalleryItem[]>([]);

function bucket(side: PanelSide) {
  return side === "right" ? right : left;
}

export function useGalleries() {
  const { push } = useAlerts();

  async function add(side: PanelSide, files: FileList | File[] | null | undefined) {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        push("upload.notAnImage", { name: file.name }, "warning");
        continue;
      }
      // Pre-checked client-side so the user gets a real message instead of a
      // bare 413 from whatever proxy is in front of the API.
      if (file.size > MAX_UPLOAD_BYTES) {
        push("upload.tooBig", { name: file.name, max: prettyBytes(MAX_UPLOAD_BYTES) }, "warning");
        continue;
      }
      await addOne(side, file);
    }
  }

  async function addOne(side: PanelSide, file: File) {
    let bitmap: ImageBitmap;
    try {
      // createImageBitmap decodes off the main thread — no FileReader, no data
      // URL, no <img> load race. This alone deletes two of the old leaks.
      bitmap = markRaw(await createImageBitmap(file));
    } catch {
      push("upload.notAnImage", { name: file.name }, "warning");
      return;
    }

    const item: GalleryItem = {
      id: crypto.randomUUID(),
      assetId: null,
      name: file.name || "image",
      url: URL.createObjectURL(file),
      bitmap,
      state: "uploading",
    };
    const ref = bucket(side);
    ref.value = [...ref.value, item];

    try {
      const asset = await uploadAsset(file);
      patch(side, item.id, { assetId: asset.id, state: "ready" });
    } catch (err) {
      patch(side, item.id, { state: "failed" });
      push(
        err instanceof ApiError ? `errors.${err.code}` : "errors.network",
        err instanceof ApiError ? err.params : undefined,
      );
    }
  }

  function patch(side: PanelSide, id: string, changes: Partial<GalleryItem>) {
    const ref = bucket(side);
    ref.value = ref.value.map((it) => (it.id === id ? { ...it, ...changes } : it));
  }

  function move(side: PanelSide, index: number, delta: number) {
    const ref = bucket(side);
    const next = [...ref.value];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    ref.value = next;
  }

  function remove(side: PanelSide, index: number) {
    const ref = bucket(side);
    const item = ref.value[index];
    if (!item) return;
    ref.value = ref.value.filter((_, i) => i !== index);
    disposeItem(item);
  }

  function clear(side: PanelSide) {
    const ref = bucket(side);
    for (const item of ref.value) disposeItem(item);
    ref.value = [];
  }

  return { right, left, add, move, remove, clear, bucket };
}

function disposeItem(item: GalleryItem): void {
  URL.revokeObjectURL(item.url);
  item.bitmap.close();
  if (item.assetId) void deleteAsset(item.assetId).catch(() => {});
}

/** Called once from App.vue's pagehide handler. */
export function disposeAllItems(): void {
  for (const item of [...right.value, ...left.value]) disposeItem(item);
  right.value = [];
  left.value = [];
}

export function readyAssetIds(items: readonly GalleryItem[]): string[] {
  return items.flatMap((it) => (it.assetId && it.state === "ready" ? [it.assetId] : []));
}
