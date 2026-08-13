<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useEncodeJob } from "../../composables/useEncodeJob";
import { prettyBytes } from "../../utils/format";
import Icon from "../Icon/Icon.vue";

const { t } = useI18n();
const { job, running, resultUrl, cancel } = useEncodeJob();

const percent = computed(() => Math.round((job.value?.progress ?? 0) * 100));
</script>

<template>
  <section class="mc-panel result">
    <header class="mc-card-header">
      <span><Icon name="image" /> {{ t("result.title") }}</span>
      <span v-if="job?.bytes" class="mc-badge accent mc-num">{{ prettyBytes(job.bytes) }}</span>
    </header>

    <div v-if="!job" class="mc-empty compact">
      <Icon class="mc-empty__icon" name="image" :size="24" />
      <p class="mc-empty__text">{{ t("result.empty") }}</p>
    </div>

    <template v-else-if="running">
      <div class="mc-storage-track">
        <div class="mc-storage-fill" :style="{ width: `${percent}%` }" />
      </div>
      <p class="result__status mc-num">{{ t(`result.phase.${job.phase}`) }} — {{ percent }} %</p>
      <button type="button" class="mc-btn ghost danger sm" @click="cancel">
        {{ t("result.cancel") }}
      </button>
    </template>

    <template v-else-if="job.status === 'done' && resultUrl">
      <img class="result__image" :src="resultUrl" :alt="t('result.alt')" />
      <div class="mc-cluster between result__footer">
        <span class="mc-label mc-num">
          {{ t("result.frames", { kept: job.keptFrames ?? 0, total: job.totalFrames }) }}
          · {{ job.width }}×{{ job.height }}
        </span>
        <!-- Reuses the SAME object URL as the <img> above. The original minted a
             third one here and revoked none of them. -->
        <a class="mc-btn primary" :href="resultUrl" download="pannelisation.gif">
          <Icon name="download" :size="12" /> {{ t("result.download") }}
        </a>
      </div>
    </template>

    <div v-else class="mc-empty compact">
      <Icon class="mc-empty__icon" name="warning" :size="24" />
      <p class="mc-empty__text">{{ t(`result.phase.${job.phase}`) }}</p>
    </div>
  </section>
</template>

<style src="./ResultPanel.css"></style>
