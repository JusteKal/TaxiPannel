import {
  computeTimeline,
  DEFAULT_SETTINGS,
  encodeQuality,
  normalizeSettings,
  type Settings,
  type Timeline,
} from "@taxipannel/api/timeline";
import { computed, reactive, watch } from "vue";
import { useGalleries } from "./useGalleries";

const STORAGE_KEY = "taxipannel:settings";

function load(): Settings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return normalizeSettings(JSON.parse(saved));
  } catch {
    // Private mode, quota, or a corrupt blob from an older version: the
    // defaults are always a valid answer.
  }
  return { ...DEFAULT_SETTINGS };
}

// Module scope: one settings object for the whole app.
const settings = reactive<Settings>(load());

watch(
  settings,
  (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // See load().
    }
  },
  { deep: true },
);

export function useSettings() {
  const { right, left } = useGalleries();

  // The single source of truth for the estimate, the preview clock and the
  // frame-count guard — all three read the SAME computeTimeline the encoder does.
  const timeline = computed<Timeline>(() =>
    computeTimeline(right.value.length, left.value.length, normalizeSettings(settings)),
  );

  const quality = computed(() => encodeQuality(settings.gifQuality));

  const ready = computed(() => right.value.length > 0 && left.value.length > 0);

  return { settings, timeline, quality, ready };
}
