<script setup lang="ts">
import type { GalleryItem } from "../../composables/useGalleries";
import GalleryThumb from "../GalleryThumb/GalleryThumb.vue";
import Icon from "../Icon/Icon.vue";

defineProps<{ items: readonly GalleryItem[] }>();
defineEmits<{ move: [index: number, delta: number]; remove: [index: number] }>();
</script>

<template>
  <div v-if="items.length === 0" class="mc-empty compact">
    <Icon class="mc-empty__icon" name="image" :size="24" />
    <p class="mc-empty__title">Aucune image</p>
    <p class="mc-empty__text">Ajoutez au moins une image pour ce panneau.</p>
  </div>
  <ul v-else class="gallery">
    <GalleryThumb
      v-for="(item, index) in items"
      :key="item.id"
      :item="item"
      :index="index"
      :total="items.length"
      @move="(i, d) => $emit('move', i, d)"
      @remove="(i) => $emit('remove', i)"
    />
  </ul>
</template>

<style src="./ImageGallery.css"></style>
