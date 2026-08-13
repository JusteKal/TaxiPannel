<script setup lang="ts">
import { MAX_RECOMMENDED_FRAMES } from "@taxipannel/api/timeline";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import FrameWarningDialog from "../components/FrameWarningDialog/FrameWarningDialog.vue";
import Icon from "../components/Icon/Icon.vue";
import LivePreview from "../components/LivePreview/LivePreview.vue";
import PanelUploader from "../components/PanelUploader/PanelUploader.vue";
import ResultPanel from "../components/ResultPanel/ResultPanel.vue";
import SettingsForm from "../components/SettingsForm/SettingsForm.vue";
import { useEncodeJob } from "../composables/useEncodeJob";
import { useSettings } from "../composables/useSettings";

const { t } = useI18n();
const { timeline, ready } = useSettings();
const { busy, running, pendingConfirmation, start } = useEncodeJob();

const canGenerate = computed(() => ready.value && !busy.value && !running.value);
</script>

<template>
  <div class="builder">
    <div class="builder__main">
      <section class="builder__uploads">
        <!-- "right" is the old gallery key `x`, "left" is `y`. -->
        <PanelUploader side="right" />
        <PanelUploader side="left" />
      </section>

      <LivePreview />
      <ResultPanel />
    </div>

    <aside class="builder__side">
      <SettingsForm />
      <button type="button" class="mc-btn primary builder__generate" :disabled="!canGenerate" @click="start(false)">
        <Icon name="wand" :size="13" />
        {{ running ? t("actions.generating") : t("actions.generate") }}
      </button>
    </aside>

    <FrameWarningDialog
      v-if="pendingConfirmation"
      :frames="timeline.totalFrames"
      :max="MAX_RECOMMENDED_FRAMES"
      @confirm="start(true)"
      @cancel="pendingConfirmation = false"
    />
  </div>
</template>

<style src="./BuilderView.css"></style>
