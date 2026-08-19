<script setup lang="ts">
import { ref } from "vue";
import { type PreviewView, usePreview } from "../../composables/usePreview";
import { useSettings } from "../../composables/useSettings";
import Icon from "../Icon/Icon.vue";

const { timeline } = useSettings();

const canvas = ref<HTMLCanvasElement | null>(null);
const { playing, position, view, ready, seek, toggle } = usePreview(canvas);

const VIEWS: { id: PreviewView; label: string }[] = [
  { id: "atlas", label: "Atlas" },
  { id: "right", label: "Panneau droite" },
  { id: "left", label: "Panneau gauche" },
];

function onScrub(e: Event) {
  seek(Number((e.target as HTMLInputElement).value));
}
</script>

<template>
  <section class="mc-panel preview">
    <header class="mc-card-header">
      <span><Icon name="film" /> Aperçu</span>
      <div class="mc-cluster preview__views">
        <button
          v-for="v in VIEWS"
          :key="v.id"
          type="button"
          class="mc-btn ghost sm"
          :class="{ 'is-active': view === v.id }"
          @click="view = v.id"
        >
          {{ v.label }}
        </button>
      </div>
    </header>

    <div class="preview__stage">
      <!-- v-show, not v-if: the canvas element must stay mounted or the rAF
           loop in usePreview would draw into a detached node. -->
      <canvas v-show="ready" ref="canvas" class="preview__canvas" aria-label="Aperçu animé de l'atlas 2×2" />
      <div v-if="!ready" class="mc-empty compact">
        <Icon class="mc-empty__icon" name="film" :size="24" />
        <p class="mc-empty__text">Ajoutez des images dans les deux panneaux pour lancer l'aperçu.</p>
      </div>
    </div>

    <div v-if="ready" class="preview__transport mc-cluster">
      <button
        type="button"
        class="mc-btn icon"
        :aria-label="playing ? 'Pause' : 'Lecture'"
        @click="toggle"
      >
        <Icon :name="playing ? 'pause' : 'play'" :size="12" />
      </button>
      <input
        class="mc-range preview__scrub"
        type="range"
        min="0"
        step="0.01"
        :max="timeline.totalLoopSeconds"
        :value="position"
        aria-label="Position dans la boucle"
        @pointerdown="playing = false"
        @input="onScrub"
      />
      <span class="mc-num preview__time">
        {{ position.toFixed(1) }} / {{ timeline.totalLoopSeconds.toFixed(1) }} s
      </span>
    </div>

    <p v-if="ready && view === 'atlas'" class="preview__hint mc-muted">
      Chaque panneau apparaît deux fois, en diagonale — c'est la disposition attendue par le jeu.
    </p>
  </section>
</template>

<style src="./LivePreview.css"></style>
