<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { LOCALES, type Locale, setLocale } from "../../i18n";

const { t, locale } = useI18n();
</script>

<template>
  <div class="locale-switcher" role="group" :aria-label="t('locale.switch')">
    <button
      v-for="code in LOCALES"
      :key="code"
      type="button"
      class="mc-btn ghost sm"
      :class="{ 'is-active': locale === code }"
      :aria-pressed="locale === code"
      @click="setLocale(code as Locale)"
    >
      {{ t(`locale.${code}`) }}
    </button>
  </div>
</template>

<style src="./LocaleSwitcher.css"></style>
