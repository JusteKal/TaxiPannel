<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { type PanelSide, useGalleries } from "../../composables/useGalleries";
import Icon from "../Icon/Icon.vue";
import ImageGallery from "../ImageGallery/ImageGallery.vue";

const props = defineProps<{ side: PanelSide }>();

const { t } = useI18n();
const { add, move, remove, bucket } = useGalleries();

const items = computed(() => bucket(props.side).value);
const inputId = computed(() => `upload-${props.side}`);

// A depth counter, not @dragleave.self: dragleave fires every time the cursor
// crosses a child, and the dropzone is a <label> wrapping an <input> plus a
// hint span, so .self breaks the moment anything is nested inside it.
const depth = ref(0);
const over = computed(() => depth.value > 0);

function onEnter(e: DragEvent) {
  e.preventDefault();
  depth.value++;
}
function onOver(e: DragEvent) {
  e.preventDefault(); // required, otherwise the browser refuses the drop
}
function onLeave() {
  depth.value = Math.max(0, depth.value - 1);
}
function onDrop(e: DragEvent) {
  e.preventDefault();
  depth.value = 0;
  void add(props.side, e.dataTransfer?.files);
}
function onPick(e: Event) {
  const input = e.target as HTMLInputElement;
  void add(props.side, input.files);
  // Cleared so re-picking the same file fires `change` again.
  input.value = "";
}
</script>

<template>
  <section class="mc-panel uploader">
    <header class="mc-card-header">
      <span><Icon name="image" /> {{ t(`panel.${side}`) }}</span>
      <span class="mc-badge neutral mc-num">{{ items.length }}</span>
    </header>

    <label
      class="dropzone"
      :class="{ 'dropzone--over': over }"
      :for="inputId"
      @dragenter="onEnter"
      @dragover="onOver"
      @dragleave="onLeave"
      @drop="onDrop"
    >
      <Icon name="upload" :size="18" />
      <span>{{ over ? t("upload.drop") : t("upload.hint") }}</span>
      <input
        :id="inputId"
        class="dropzone__input"
        type="file"
        accept="image/*"
        multiple
        @change="onPick"
      />
    </label>

    <ImageGallery
      :items="items"
      @move="(i, d) => move(side, i, d)"
      @remove="(i) => remove(side, i)"
    />
  </section>
</template>

<style src="./PanelUploader.css"></style>
