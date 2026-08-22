<script setup>
import { computed } from "vue";
import { buildSpeciesLeafLegend, createLeafSymbolDataUrl } from "../utils/ecoSymbols";

const props = defineProps({
  species: { type: String, default: "" },
  symbol: { type: Object, default: null },
  size: { type: Number, default: 14 },
});

const symbol = computed(() => {
  if (props.symbol) return props.symbol;
  const fallback = buildSpeciesLeafLegend([{ species: props.species || "树木" }]);
  return fallback.symbolMap[props.species || "树木"] ?? fallback.otherSymbol;
});
const symbolStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  backgroundImage: `url("${createLeafSymbolDataUrl(symbol.value)}")`,
  backgroundSize: "contain",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "center",
}));
</script>

<template>
  <span
    class="eco-species-symbol"
    :style="symbolStyle"
    aria-hidden="true"
  />
</template>

<style scoped>
.eco-species-symbol {
  display: inline-block;
  flex: 0 0 auto;
  line-height: 0;
}
</style>
