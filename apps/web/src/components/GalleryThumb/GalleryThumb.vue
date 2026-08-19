<script setup lang="ts">
import type { GalleryItem } from "../../composables/useGalleries";
import Icon from "../Icon/Icon.vue";

defineProps<{ item: GalleryItem; index: number; total: number }>();
defineEmits<{ move: [index: number, delta: number]; remove: [index: number] }>();

const STATE_LABEL: Record<GalleryItem["state"], string> = {
  uploading: "Envoi…",
  ready: "",
  failed: "Échec",
};
</script>

<template>
  <li class="thumb" :class="`thumb--${item.state}`">
    <span class="mc-badge accent thumb__order mc-num">{{ index + 1 }}</span>
    <!-- :alt binds an attribute as a string. The original interpolated the
         filename into innerHTML, which broke on a quote. -->
    <img class="thumb__image" :src="item.url" :alt="item.name" />
    <span v-if="item.frames.length > 1" class="mc-badge accent thumb__frames mc-num">
      <Icon name="film" :size="9" /> {{ item.frames.length }}
    </span>
    <span
      v-if="item.state !== 'ready'"
      class="mc-status thumb__state"
      :class="item.state === 'failed' ? 'error' : 'busy'"
    >
      {{ STATE_LABEL[item.state] }}
    </span>
    <div class="thumb__controls">
      <button
        type="button"
        class="mc-btn ghost icon sm"
        :disabled="index === 0"
        aria-label="Monter"
        @click="$emit('move', index, -1)"
      >
        <Icon name="up" :size="10" />
      </button>
      <button
        type="button"
        class="mc-btn ghost icon sm"
        :disabled="index === total - 1"
        aria-label="Descendre"
        @click="$emit('move', index, 1)"
      >
        <Icon name="down" :size="10" />
      </button>
      <button
        type="button"
        class="mc-btn ghost danger icon sm"
        aria-label="Retirer"
        @click="$emit('remove', index)"
      >
        <Icon name="xmark" :size="10" />
      </button>
    </div>
  </li>
</template>

<style src="./GalleryThumb.css"></style>
