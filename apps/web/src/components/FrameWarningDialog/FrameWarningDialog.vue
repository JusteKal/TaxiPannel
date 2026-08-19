<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

defineProps<{ frames: number; max: number }>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();

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
      <p class="mc-dialog__title">Beaucoup de trames à générer</p>
      <div class="mc-dialog__body">
        <p>
          Cette configuration produit {{ frames }} trames (recommandé : {{ max }} au maximum). La
          génération sera longue et le fichier lourd.
        </p>
        <p class="frame-dialog__tip">
          Astuce : mettez le même nombre d'images des deux côtés pour raccourcir fortement la boucle.
        </p>
      </div>
      <div class="mc-dialog__footer">
        <button type="button" class="mc-btn ghost" @click="emit('cancel')">Annuler</button>
        <button ref="confirmButton" type="button" class="mc-btn primary" @click="emit('confirm')">
          Générer quand même
        </button>
      </div>
    </div>
  </div>
</template>

<style src="./FrameWarningDialog.css"></style>
