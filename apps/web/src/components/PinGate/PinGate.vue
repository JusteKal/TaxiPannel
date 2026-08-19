<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ApiError, unlock } from "../../api/client";
import { useAccess } from "../../composables/useAccess";
import { errorMessage } from "../../utils/errors";
import Icon from "../Icon/Icon.vue";

const { open } = useAccess();

const pin = ref("");
const pending = ref(false);
const error = ref<string | null>(null);
const input = ref<HTMLInputElement | null>(null);

onMounted(() => input.value?.focus());

// Chrome only. The gate the platform actually relies on is the server guard:
// every route but /health and /auth answers `pinRequired` without a token.
async function submit(): Promise<void> {
  if (pending.value || !pin.value) return;
  pending.value = true;
  error.value = null;
  try {
    open(await unlock(pin.value));
    pin.value = "";
  } catch (err) {
    error.value =
      err instanceof ApiError ? errorMessage(err.code, err.params) : errorMessage("network");
    input.value?.select();
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <section class="mc-panel pin-gate">
    <div class="pin-gate__head">
      <Icon name="lock" :size="18" />
      <h1 class="pin-gate__title">Accès restreint</h1>
    </div>
    <p class="pin-gate__body">Cet outil est réservé aux membres autorisés. Entrez le code PIN pour continuer.</p>

    <form class="mc-field pin-gate__form" @submit.prevent="submit">
      <label class="pin-gate__label" for="pin-gate-input">Code PIN</label>
      <input
        id="pin-gate-input"
        ref="input"
        v-model="pin"
        class="mc-input"
        :class="{ 'is-invalid': error }"
        type="password"
        inputmode="text"
        autocomplete="off"
        :disabled="pending"
        placeholder="••••••"
      />
      <p v-if="error" class="mc-form-error">
        <Icon name="warning" :size="12" />
        {{ error }}
      </p>
      <button type="submit" class="mc-btn primary pin-gate__submit" :disabled="pending || !pin">
        {{ pending ? "Vérification…" : "Déverrouiller" }}
      </button>
    </form>
  </section>
</template>

<style src="./PinGate.css"></style>
