<script setup lang="ts">
import { onMounted } from "vue";
import AlertStack from "./components/AlertStack/AlertStack.vue";
import TopNav from "./components/TopNav/TopNav.vue";
import { disposeResult } from "./composables/useEncodeJob";
import { disposeAllItems } from "./composables/useGalleries";

// Single place where every object URL and ImageBitmap is released. `pagehide`
// and not `beforeunload`: the latter never fires on mobile Safari.
onMounted(() => {
  window.addEventListener("pagehide", () => {
    disposeAllItems();
    disposeResult();
  });
});
</script>

<template>
  <div class="app-shell">
    <TopNav />
    <main class="app-shell__main">
      <AlertStack />
      <RouterView />
    </main>
  </div>
</template>

<style src="./App.css"></style>
