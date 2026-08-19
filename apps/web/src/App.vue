<script setup lang="ts">
import { onMounted } from "vue";
import { accessState } from "./api/client";
import AlertStack from "./components/AlertStack/AlertStack.vue";
import PinGate from "./components/PinGate/PinGate.vue";
import TopNav from "./components/TopNav/TopNav.vue";
import { useAccess } from "./composables/useAccess";
import { disposeResult } from "./composables/useEncodeJob";
import { disposeAllItems } from "./composables/useGalleries";

const { locked, ready, settle } = useAccess();

// Single place where every object URL and ImageBitmap is released. `pagehide`
// and not `beforeunload`: the latter never fires on mobile Safari.
onMounted(async () => {
  window.addEventListener("pagehide", () => {
    disposeAllItems();
    disposeResult();
  });

  try {
    settle(await accessState());
  } catch {
    settle(null);
  }
});
</script>

<template>
  <div class="app-shell">
    <TopNav />
    <main class="app-shell__main">
      <AlertStack />
      <PinGate v-if="locked" />
      <RouterView v-else-if="ready" />
    </main>
  </div>
</template>

<style src="./App.css"></style>
