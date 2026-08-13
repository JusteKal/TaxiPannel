<script setup lang="ts">
import { useI18n } from "vue-i18n";
import LocaleSwitcher from "../LocaleSwitcher/LocaleSwitcher.vue";

const { t } = useI18n();
</script>

<template>
  <header class="mc-topnav">
    <div class="mc-topnav__inner">
      <img class="mc-topnav__logo" src="/logo.webp" alt="" width="28" height="28" />
      <div class="mc-topnav__brand">
        <span class="mc-topnav__title">{{ t("app.title") }}</span>
        <span class="mc-topnav__tagline">{{ t("app.tagline") }}</span>
      </div>
      <div class="mc-topnav__actions">
        <LocaleSwitcher />
      </div>
    </div>
  </header>
</template>

<style src="./TopNav.css"></style>
