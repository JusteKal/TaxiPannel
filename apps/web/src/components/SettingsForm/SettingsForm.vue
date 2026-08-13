<script setup lang="ts">
import {
  FPS_OPTIONS,
  QUALITY_LOSSLESS_MAX,
  SCALE_OPTIONS,
  SETTINGS_SPEC,
} from "@taxipannel/api/timeline";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useSettings } from "../../composables/useSettings";
import Icon from "../Icon/Icon.vue";

const { t } = useI18n();
const { settings, timeline, quality, ready } = useSettings();

// The old <select> labels, keyed off the value so the wording is translatable
// without duplicating the option list.
const FPS_LABEL: Record<number, string> = { 8: "light", 12: "recommended", 20: "heavy" };
const SCALE_LABEL: Record<number, string> = { 1: "native", 0.75: "p75", 0.5: "p50", 0.25: "p25" };

function fpsText(n: number): string {
  return t(`settings.fpsOption.${FPS_LABEL[n] ?? "plain"}`, { n });
}

const qualityHint = computed(() =>
  settings.gifQuality <= QUALITY_LOSSLESS_MAX
    ? t("settings.qualityLossless", { colors: quality.value.colors })
    : t("settings.qualityLossy", { colors: quality.value.colors, lossy: quality.value.lossy }),
);

const estimate = computed(() =>
  ready.value
    ? t("settings.estimate", {
        seconds: timeline.value.totalLoopSeconds.toFixed(1),
        frames: timeline.value.totalFrames,
      })
    : t("settings.estimateEmpty"),
);
</script>

<template>
  <section class="mc-panel settings">
    <header class="mc-card-header">
      <span><Icon name="sliders" /> {{ t("settings.title") }}</span>
    </header>

    <div class="mc-stack tight">
      <label class="mc-field">
        <span class="mc-label">{{ t("settings.displayDuration") }}</span>
        <input
          v-model.number="settings.displayDuration"
          class="mc-input mc-num"
          type="number"
          :min="SETTINGS_SPEC.displayDuration.min"
          :step="SETTINGS_SPEC.displayDuration.step"
        />
      </label>

      <label class="mc-field">
        <span class="mc-label">{{ t("settings.transitionDuration") }}</span>
        <input
          v-model.number="settings.transitionDuration"
          class="mc-input mc-num"
          type="number"
          :min="SETTINGS_SPEC.transitionDuration.min"
          :step="SETTINGS_SPEC.transitionDuration.step"
        />
      </label>

      <label class="mc-field">
        <span class="mc-label">{{ t("settings.fps") }}</span>
        <select v-model.number="settings.fps" class="mc-select mc-num">
          <option v-for="n in FPS_OPTIONS" :key="n" :value="n">{{ fpsText(n) }}</option>
        </select>
      </label>

      <label class="mc-field">
        <span class="mc-label">{{ t("settings.scale") }}</span>
        <select v-model.number="settings.scale" class="mc-select mc-num">
          <option v-for="s in SCALE_OPTIONS" :key="s" :value="s">
            {{ t(`settings.scaleOption.${SCALE_LABEL[s]}`) }}
          </option>
        </select>
      </label>

      <label class="mc-field">
        <span class="mc-label">{{ t("settings.gifQuality") }}</span>
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
        <span class="mc-label">{{ t("settings.skipSimilarity") }}</span>
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
      {{ t("settings.sizeHint", { width: timeline.atlasW, height: timeline.atlasH }) }}
    </p>
  </section>
</template>

<style src="./SettingsForm.css"></style>
