<script setup lang="ts">
import { useAlerts } from "../../composables/useAlerts";
import Icon from "../Icon/Icon.vue";

// Replaces every alert() in the original: non-blocking and dismissible.
const { alerts, dismiss } = useAlerts();
</script>

<template>
  <div v-if="alerts.length" class="alert-stack" role="status" aria-live="polite">
    <div
      v-for="alert in alerts"
      :key="alert.id"
      class="mc-alert"
      :class="`mc-alert--${alert.level}`"
    >
      <Icon name="warning" :size="14" />
      <span class="mc-alert__body">{{ alert.message }}</span>
      <button type="button" class="mc-btn ghost icon sm" aria-label="Annuler" @click="dismiss(alert.id)">
        <Icon name="xmark" :size="11" />
      </button>
    </div>
  </div>
</template>

<style src="./AlertStack.css"></style>
