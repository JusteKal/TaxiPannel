<script setup lang="ts">
import {
  FPS_OPTIONS,
  QUALITY_LOSSLESS_MAX,
  SCALE_OPTIONS,
  SETTINGS_SPEC,
} from "@taxipannel/api/timeline";
import { computed } from "vue";
import { useSettings } from "../../composables/useSettings";
import Icon from "../Icon/Icon.vue";

const { settings, timeline, quality, ready } = useSettings();

// Keyed off the value rather than listed in order, so the option list stays
// the single source of which values exist.
const FPS_SUFFIX: Record<number, string> = { 8: " (léger)", 12: " (recommandé)", 20: " (lourd)" };
const SCALE_LABEL: Record<number, string> = {
  1: "100 % (native)",
  0.75: "75 %",
  0.5: "50 % (plus petit)",
  0.25: "25 % (très petit)",
};

function fpsText(n: number): string {
  return `${n}${FPS_SUFFIX[n] ?? ""}`;
}

const qualityHint = computed(() =>
  settings.gifQuality <= QUALITY_LOSSLESS_MAX
    ? `${quality.value.colors} couleurs · sans perte`
    : `${quality.value.colors} couleurs · compression avec perte ${quality.value.lossy} %`,
);

const estimate = computed(() =>
  ready.value
    ? `Boucle complète : ${timeline.value.totalLoopSeconds.toFixed(1)} s · ` +
      `${timeline.value.totalFrames} images générées avant export`
    : "Ajoutez des images dans les deux panneaux pour voir une estimation.",
);
</script>

<template>
  <section class="mc-panel settings">
    <header class="mc-card-header">
      <span><Icon name="sliders" /> Paramètres d'animation</span>
    </header>

    <div class="mc-stack tight">
      <label class="mc-field">
        <span class="mc-label">Durée d'affichage (s)</span>
        <input
          v-model.number="settings.displayDuration"
          class="mc-input mc-num"
          type="number"
          :min="SETTINGS_SPEC.displayDuration.min"
          :step="SETTINGS_SPEC.displayDuration.step"
        />
      </label>

      <label class="mc-field">
        <span class="mc-label">Durée de transition (s)</span>
        <input
          v-model.number="settings.transitionDuration"
          class="mc-input mc-num"
          type="number"
          :min="SETTINGS_SPEC.transitionDuration.min"
          :step="SETTINGS_SPEC.transitionDuration.step"
        />
      </label>

      <label class="mc-field">
        <span class="mc-label">Fluidité (images/s)</span>
        <select v-model.number="settings.fps" class="mc-select mc-num">
          <option v-for="n in FPS_OPTIONS" :key="n" :value="n">{{ fpsText(n) }}</option>
        </select>
      </label>

      <label class="mc-field">
        <span class="mc-label">Échelle sortie</span>
        <select v-model.number="settings.scale" class="mc-select mc-num">
          <option v-for="s in SCALE_OPTIONS" :key="s" :value="s">
            {{ SCALE_LABEL[s] }}
          </option>
        </select>
      </label>

      <label class="mc-field">
        <span class="mc-label">Qualité GIF (1 = max qualité)</span>
        <input
          v-model.number="settings.gifQuality"
          class="mc-input mc-num"
          type="number"
          :min="SETTINGS_SPEC.gifQuality.min"
          :max="SETTINGS_SPEC.gifQuality.max"
          :step="SETTINGS_SPEC.gifQuality.step"
        />
        <span class="mc-form-help mc-num">{{ qualityHint }}</span>
      </label>

      <label class="mc-field">
        <span class="mc-label">Ignorer trames similaires (%)</span>
        <input
          v-model.number="settings.skipSimilarity"
          class="mc-input mc-num"
          type="number"
          :min="SETTINGS_SPEC.skipSimilarity.min"
          :max="SETTINGS_SPEC.skipSimilarity.max"
          :step="SETTINGS_SPEC.skipSimilarity.step"
        />
      </label>
    </div>

    <p class="settings__estimate mc-num">{{ estimate }}</p>
    <p class="settings__size mc-label">
      Sortie {{ timeline.atlasW }}×{{ timeline.atlasH }}
    </p>
  </section>
</template>

<style src="./SettingsForm.css"></style>
