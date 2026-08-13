<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { GalleryItem } from "../../composables/useGalleries";
import GalleryThumb from "../GalleryThumb/GalleryThumb.vue";
import Icon from "../Icon/Icon.vue";

defineProps<{ items: readonly GalleryItem[] }>();
defineEmits<{ move: [index: number, delta: number]; remove: [index: number] }>();

const { t } = useI18n();
</script>

<template>
  <div v-if="items.length === 0" class="mc-empty compact">
    <Icon class="mc-empty__icon" name="image" :size="24" />
    <p class="mc-empty__title">{{ t("gallery.emptyTitle") }}</p>
    <p class="mc-empty__text">{{ t("gallery.emptyText") }}</p>
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
