<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

defineProps<{ frames: number; max: number }>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();

const { t } = useI18n();
const confirmButton = ref<HTMLButtonElement | null>(null);

// Replaces confirm(). Unlike confirm() this does not block the thread, so the
// preview keeps animating behind it while the user decides.
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") emit("cancel");
}

onMounted(() => {
  document.addEventListener("keydown", onKey);
  confirmButton.value?.focus();
});
onBeforeUnmount(() => document.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="mc-overlay" role="dialog" aria-modal="true" @click.self="emit('cancel')">
    <div class="mc-dialog">
      <p class="mc-dialog__title">{{ t("dialog.framesTitle") }}</p>
      <div class="mc-dialog__body">
        <p>{{ t("dialog.framesBody", { frames, max }) }}</p>
        <p class="frame-dialog__tip">{{ t("dialog.framesTip") }}</p>
      </div>
      <div class="mc-dialog__footer">
        <button type="button" class="mc-btn ghost" @click="emit('cancel')">
          {{ t("dialog.cancel") }}
        </button>
        <button ref="confirmButton" type="button" class="mc-btn primary" @click="emit('confirm')">
          {{ t("dialog.framesConfirm") }}
        </button>
      </div>
    </div>
  </div>
</template>

<style src="./FrameWarningDialog.css"></style>
