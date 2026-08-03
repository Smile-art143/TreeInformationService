<script setup>
import { computed } from "vue";
import { Filter, RotateCcw } from "lucide-vue-next";
import { otherSpeciesColor, topSpeciesColorLimit } from "../api/mockApi";

const props = defineProps({
  trees: { type: Array, default: () => [] },
  filteredCount: { type: Number, default: 0 },
  speciesFilter: { type: Array, default: () => [] },
  dbhRange: { type: Array, default: () => [0, 100] },
  healthFilter: { type: String, default: "all" },
  speciesColors: { type: Object, default: () => ({}) },
});

const emit = defineEmits(["speciesChange", "dbhRangeChange", "healthChange", "reset"]);

const speciesOptions = computed(() => {
  return Array.from(new Set(props.trees.map((tree) => tree.species)))
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))
    .map((species) => ({ label: species, value: species }));
});

const speciesLegend = computed(() => {
  const counts = new Map();
  props.trees.forEach((tree) => {
    counts.set(tree.species, (counts.get(tree.species) ?? 0) + 1);
  });
  return Array.from(counts).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0], "zh-Hans-CN");
  });
});

const topSpeciesLegend = computed(() => speciesLegend.value.slice(0, topSpeciesColorLimit));
const otherSpeciesCount = computed(() =>
  speciesLegend.value.slice(topSpeciesColorLimit).reduce((sum, [, count]) => sum + count, 0)
);

const maxDbh = computed(() => Math.max(...props.trees.map((tree) => tree.dbh), 100));

const onSpeciesChange = (val) => emit("speciesChange", val);
const onDbhRangeChange = (val) => emit("dbhRangeChange", val);
const onHealthChange = (val) => emit("healthChange", val);
const onReset = () => emit("reset");
</script>

<template>
  <a-card class="map-panel filter-panel" :bordered="false">
    <div class="panel-title">
      <Filter :size="17" />
      <span>树木筛选</span>
    </div>
    <a-space direction="vertical" :size="16" class="full-width">
      <a-statistic title="当前显示" :value="filteredCount" :suffix="`/ ${trees.length} 棵`" />
      <a-select
        mode="multiple"
        allow-clear
        placeholder="按树种筛选"
        :value="speciesFilter"
        :options="speciesOptions"
        @change="onSpeciesChange"
        :max-tag-count="'responsive'"
      />
      <div>
        <div class="control-label">健康状态</div>
        <a-segmented
          block
          :value="healthFilter"
          :options="[
            { label: '全部', value: 'all' },
            { label: '健康', value: 'healthy' },
            { label: '观察', value: 'warning' },
            { label: '异常', value: 'problem' },
          ]"
          @change="onHealthChange"
        />
      </div>
      <div>
        <div class="control-label">胸径范围：{{ dbhRange[0] }} - {{ dbhRange[1] }} cm</div>
        <a-slider
          range
          :min="0"
          :max="Math.ceil(maxDbh)"
          :value="dbhRange"
          @change="onDbhRangeChange"
        />
      </div>
      <div class="legend-list">
        <a-tag v-for="[species] in topSpeciesLegend" :key="species" class="legend-tag">
          <span class="legend-dot" :style="{ background: speciesColors[species] }" />
          {{ species }}
        </a-tag>
        <a-tag v-if="otherSpeciesCount > 0" class="legend-tag">
          <span class="legend-dot" :style="{ background: otherSpeciesColor }" />
          其他树种 {{ otherSpeciesCount }}
        </a-tag>
      </div>
      <a-button @click="onReset"><RotateCcw :size="15" />清除筛选</a-button>
    </a-space>
  </a-card>
</template>
