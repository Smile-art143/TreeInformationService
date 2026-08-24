<script setup>
import { computed } from "vue";
import { speciesSymbolConfig } from "../utils/ecoSymbols";

const props = defineProps({
  species: { type: String, required: true },
  size: { type: Number, default: 14 },
});

const symbol = computed(() => speciesSymbolConfig(props.species));
const symbolStyle = computed(() => ({
  "--eco-symbol-color": symbol.value.color,
  "--eco-symbol-size": `${props.size}px`,
}));
</script>

<template>
  <span
    class="eco-species-symbol"
    :class="`is-${symbol.style}`"
    :style="symbolStyle"
    aria-hidden="true"
  />
</template>

<style scoped>
.eco-species-symbol {
  position: relative;
  width: var(--eco-symbol-size);
  height: var(--eco-symbol-size);
  display: inline-block;
  flex: 0 0 auto;
  color: var(--eco-symbol-color);
  background: currentColor;
  box-shadow: 0 0 0 1px #ffffff, 0 0 0 2px rgba(31, 45, 50, 0.2);
}

.is-circle { border-radius: 50%; }
.is-diamond { transform: rotate(45deg) scale(0.78); }
.is-triangle {
  clip-path: polygon(50% 0, 100% 100%, 0 100%);
  box-shadow: none;
}

.is-cross,
.is-x {
  background: transparent;
  box-shadow: none;
}

.is-cross::before,
.is-cross::after,
.is-x::before,
.is-x::after {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 100%;
  height: 3px;
  background: currentColor;
  border: 1px solid #ffffff;
  content: "";
  transform: translate(-50%, -50%);
}

.is-cross::after { transform: translate(-50%, -50%) rotate(90deg); }
.is-x::before { transform: translate(-50%, -50%) rotate(45deg); }
.is-x::after { transform: translate(-50%, -50%) rotate(-45deg); }
</style>
