<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { message } from "ant-design-vue";
import { Leaf, MapPin, Search, Sparkles } from "lucide-vue-next";
import EcoValueMap from "../components/EcoValueMap.vue";
import FilterPanel from "../components/FilterPanel.vue";
import {
  createKeyProtectionWorkOrder,
  fetchEcoTreesBySite,
} from "../api/ecoApi";
import {
  ECO_BENEFIT_METRICS,
  mockTreeEcoBenefits,
  sumEcoBenefits,
} from "../api/ecoBenefits";
import {
  computeEcoGridAnalysis,
  sortTreesByEcoValueDesc,
} from "../utils/ecoGrid";

const app = inject("appState");
const { speciesColors, treeSearchOptions } = app;

const siteOptions = computed(() =>
  Array.from(new Set(app.trees.value.map((tree) => tree.siteName)))
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))
    .map((name) => ({ label: name, value: name }))
);

const selectedSite = ref(siteOptions.value[0]?.value ?? "");
const siteTrees = ref([]);
const speciesFilter = ref([]);
const dbhRange = ref([0, 100]);
const healthFilter = ref("all");
const selectedTree = ref(null);
const pendingFocusTreeId = ref(null);
const ecoMapRef = ref(null);
const gridFeatures = ref([]);
const gridTreeMap = ref(new Map());
const loading = ref(false);

const drawerOpen = ref(false);
const selectedGrid = ref(null);
const selectedRowKeys = ref([]);
const submitting = ref(false);
const submitResult = ref(null);

const requestSeq = ref(0);
let debounceTimer = null;

const GRID_COLORS = [
  "#FBF3D0",
  "#F5D56E",
  "#EDA63C",
  "#D96C2F",
  "#8E2C2C",
];

function getGridColor(level) {
  return GRID_COLORS[level - 1] ?? GRID_COLORS[GRID_COLORS.length - 1];
}

const visibleTrees = computed(() =>
  siteTrees.value.filter((tree) => {
    const speciesMatched =
      speciesFilter.value.length === 0 ||
      speciesFilter.value.includes(tree.species);
    const dbhMatched =
      tree.dbh >= dbhRange.value[0] && tree.dbh <= dbhRange.value[1];
    const healthMatched =
      healthFilter.value === "all" ||
      tree.healthStatus === healthFilter.value;
    return speciesMatched && dbhMatched && healthMatched;
  })
);

const benefitData = computed(() =>
  selectedTree.value
    ? mockTreeEcoBenefits(selectedTree.value)
    : sumEcoBenefits(siteTrees.value)
);

const benefitScopeLabel = computed(() =>
  selectedTree.value
    ? `${selectedTree.value.code} / ${selectedTree.value.species}`
    : "全部树木"
);

const summary = computed(() => {
  const grids = gridFeatures.value;
  return {
    treeCount: visibleTrees.value.length,
    gridCount: grids.length,
    totalValueYuan: grids.reduce((sum, grid) => sum + grid.properties.totalValueYuan, 0),
    topLevelCount: grids.filter((grid) => grid.properties.level === 5).length,
  };
});

const columns = [
  {
    title: "树木编号",
    dataIndex: "code",
    key: "code",
    width: 96,
  },
  {
    title: "树种",
    dataIndex: "species",
    key: "species",
  },
  {
    title: "胸径",
    dataIndex: "dbh",
    key: "dbh",
    width: 88,
    customRender: ({ text }) => (text ? `${text} cm` : "未记录"),
  },
  {
    title: "年生态价值",
    key: "annualValueYuan",
    width: 128,
    customRender: ({ record }) => formatYuan(record.eco?.annualValueYuan),
  },
];

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys) => {
    selectedRowKeys.value = keys;
  },
}));

function formatYuan(value) {
  if (typeof value !== "number") return "未记录";
  return `¥ ${value.toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatMetricValue(value) {
  if (typeof value !== "number") return "0";
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function resetFilters(trees = siteTrees.value) {
  const maxDbh = Math.ceil(Math.max(...trees.map((tree) => tree.dbh), 100));
  speciesFilter.value = [];
  dbhRange.value = [0, maxDbh];
  healthFilter.value = "all";
}

function recomputeGrids() {
  const analysis = computeEcoGridAnalysis(visibleTrees.value);
  gridFeatures.value = analysis.grids;
  gridTreeMap.value = analysis.gridTreeMap;
}

function closeDrawer() {
  drawerOpen.value = false;
  selectedGrid.value = null;
  selectedRowKeys.value = [];
  submitResult.value = null;
}

async function loadSite(siteName, seq) {
  // 切换园区时先清空图层数据，避免新旧园区数据混叠。
  siteTrees.value = [];
  gridFeatures.value = [];
  gridTreeMap.value = new Map();
  selectedTree.value = null;
  closeDrawer();
  loading.value = true;

  try {
    const trees = await fetchEcoTreesBySite(siteName);
    if (seq !== requestSeq.value) return;

    siteTrees.value = trees;
    resetFilters(trees);
    recomputeGrids();

    if (pendingFocusTreeId.value) {
      const focusedTree = siteTrees.value.find(
        (tree) => tree.id === pendingFocusTreeId.value
      );
      if (focusedTree) {
        selectedTree.value = focusedTree;
        ecoMapRef.value?.flyTo(focusedTree.latitude, focusedTree.longitude, 18);
      }
      pendingFocusTreeId.value = null;
    }
  } catch (error) {
    if (seq === requestSeq.value) {
      message.error(error.message || "生态价值数据加载失败");
    }
  } finally {
    if (seq === requestSeq.value) {
      loading.value = false;
    }
  }
}

function onTreeSelect(attributes) {
  selectedTree.value =
    siteTrees.value.find((tree) => tree.id === attributes.treeId) ?? null;
}

function focusEcoTree(treeId) {
  const tree = app.trees.value.find((item) => item.id === treeId);
  if (!tree) return;

  if (tree.siteName !== selectedSite.value) {
    pendingFocusTreeId.value = tree.id;
    selectedSite.value = tree.siteName;
    return;
  }

  resetFilters();
  selectedTree.value = tree;
  ecoMapRef.value?.flyTo(tree.latitude, tree.longitude, 18);
}

function openGridDrawer(attributes) {
  const grid = gridFeatures.value.find(
    (feature) => feature.properties.gridId === attributes.gridId
  );
  const gridTrees = gridTreeMap.value.get(attributes.gridId) ?? [];
  if (!grid || gridTrees.length === 0) {
    message.warning("当前网格内没有可选择的树木");
    return;
  }

  selectedGrid.value = {
    ...grid.properties,
    trees: sortTreesByEcoValueDesc(gridTrees),
  };
  selectedRowKeys.value = [];
  submitResult.value = null;
  drawerOpen.value = true;
}

async function handleCreateWorkOrder() {
  if (selectedRowKeys.value.length === 0) {
    message.warning("请至少选择一棵树木");
    return;
  }

  submitting.value = true;
  submitResult.value = null;
  try {
    const result = await createKeyProtectionWorkOrder([...selectedRowKeys.value]);
    submitResult.value = {
      type: "success",
      title: "重点保护巡检工单已创建",
      description: `工单号 ${result.order.orderNo}，包含 ${result.order.treeIds.length} 棵树木。`,
    };
    message.success(`已创建工单 ${result.order.orderNo}`);
  } catch (error) {
    submitResult.value = {
      type: "error",
      title: "工单创建失败",
      description: error.message || "请稍后重试",
    };
    message.error(error.message || "工单创建失败");
  } finally {
    submitting.value = false;
  }
}

watch(selectedSite, (siteName) => {
  if (!siteName) return;
  clearTimeout(debounceTimer);
  const seq = ++requestSeq.value;
  debounceTimer = setTimeout(() => {
    loadSite(siteName, seq);
  }, 300);
});

watch([speciesFilter, dbhRange, healthFilter], recomputeGrids);

onMounted(() => {
  if (!siteOptions.value.some((option) => option.value === selectedSite.value)) {
    selectedSite.value = siteOptions.value[0]?.value ?? "";
  }
  loadSite(selectedSite.value, ++requestSeq.value);
});

onBeforeUnmount(() => {
  clearTimeout(debounceTimer);
  requestSeq.value += 1;
});
</script>

<template>
  <div class="eco-value-page">
    <EcoValueMap
      ref="ecoMapRef"
      :trees="visibleTrees"
      :grids="gridFeatures"
      @tree-select="onTreeSelect"
      @grid-select="openGridDrawer"
    />

    <div v-if="loading" class="eco-loading-mask">
      <a-spin size="large" />
    </div>

    <div class="eco-left-column">
      <div class="eco-site-switcher">
        <MapPin :size="17" />
        <a-segmented
          :value="selectedSite"
          :options="siteOptions"
          @change="selectedSite = $event"
        />
      </div>

      <div class="eco-search-panel">
        <div class="eco-search-title">
          <Search :size="17" />
          <span>Find A Tree</span>
        </div>
        <a-auto-complete
          class="tree-search"
          :options="treeSearchOptions"
          @select="focusEcoTree"
          :filter-option="(input, option) => String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())"
          placeholder="搜索树木编号或树种，如 DX-1 / 银杏"
          allow-clear
        />
      </div>

      <aside class="eco-benefit-panel">
        <div class="eco-panel-title">
          <Leaf :size="18" />
          <span>生态效益</span>
          <a-tag class="eco-benefit-scope">{{ benefitScopeLabel }}</a-tag>
        </div>

        <div class="eco-benefit-total">
          <span>年总生态价值</span>
          <strong>{{ formatYuan(benefitData.totalValueYuan) }}</strong>
        </div>

        <div class="eco-benefit-rows">
          <div
            v-for="metric in ECO_BENEFIT_METRICS"
            :key="metric.key"
            class="eco-benefit-row"
          >
            <div class="eco-benefit-metric">
              <span>{{ metric.label }}</span>
              <strong>
                {{ formatMetricValue(benefitData[metric.key]) }}
                <small>{{ metric.unit }}</small>
              </strong>
            </div>
            <div class="eco-benefit-value">
              <span>生态价值</span>
              <strong>{{ formatYuan(benefitData[`${metric.key}ValueYuan`]) }}</strong>
            </div>
          </div>
        </div>
      </aside>

      <div class="eco-filter-panel">
        <FilterPanel
          :trees="siteTrees"
          :filtered-count="visibleTrees.length"
          :species-filter="speciesFilter"
          :dbh-range="dbhRange"
          :health-filter="healthFilter"
          :species-colors="speciesColors"
          @species-change="speciesFilter = $event"
          @dbh-range-change="dbhRange = $event"
          @health-change="healthFilter = $event"
          @reset="resetFilters()"
        />
      </div>
    </div>

    <aside class="eco-summary-panel">
      <div class="eco-panel-title">
        <Sparkles :size="18" />
        <span>生态效益热点与重点保护</span>
      </div>

      <div class="eco-summary-grid">
        <div class="eco-summary-item">
          <strong>{{ summary.treeCount }}</strong>
          <span>树点</span>
        </div>
        <div class="eco-summary-item">
          <strong>{{ summary.gridCount }}</strong>
          <span>非空网格</span>
        </div>
        <div class="eco-summary-item">
          <strong>{{ formatYuan(summary.totalValueYuan) }}</strong>
          <span>网格总价值</span>
        </div>
        <div class="eco-summary-item">
          <strong>{{ summary.topLevelCount }}</strong>
          <span>5级热点</span>
        </div>
      </div>

      <div class="eco-legend">
        <div class="eco-legend-title">
          <Leaf :size="15" />
          <span>生态价值等级</span>
        </div>
        <div class="eco-legend-list">
          <div
            v-for="level in [1, 2, 3, 4, 5]"
            :key="level"
            class="eco-legend-item"
          >
            <span
              class="eco-legend-swatch"
              :style="{ background: getGridColor(level) }"
            />
            {{ level }}级
          </div>
        </div>
      </div>
    </aside>

    <a-drawer
      :open="drawerOpen"
      :width="620"
      title="重点保护候选树木"
      @close="closeDrawer"
    >
      <template v-if="selectedGrid">
        <div class="eco-drawer-meta">
          <span>网格内 {{ selectedGrid.treeCount }} 棵</span>
          <span>总价值 {{ formatYuan(selectedGrid.totalValueYuan) }}</span>
          <span>平均每棵 {{ formatYuan(selectedGrid.valuePerTree) }}</span>
        </div>

        <a-table
          class="eco-tree-table"
          :columns="columns"
          :data-source="selectedGrid.trees"
          :row-key="(record) => record.id"
          :row-selection="rowSelection"
          :pagination="{ pageSize: 8, showSizeChanger: true }"
          size="small"
          :scroll="{ y: 360 }"
        />

        <div class="eco-drawer-actions">
          <a-button
            type="primary"
            :disabled="selectedRowKeys.length === 0"
            :loading="submitting"
            @click="handleCreateWorkOrder"
          >
            创建重点保护巡检工单
          </a-button>
          <span>已选 {{ selectedRowKeys.length }} 棵</span>
        </div>

        <a-alert
          v-if="submitResult"
          class="eco-submit-result"
          :type="submitResult.type"
          :title="submitResult.title"
          :description="submitResult.description"
          show-icon
        />
      </template>
    </a-drawer>
  </div>
</template>



<style scoped>
.eco-value-page {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #e8f0f2;
}

.eco-loading-mask {
  position: absolute;
  z-index: 20;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.55);
}

.eco-left-column {
  position: absolute;
  z-index: 16;
  top: 16px;
  left: 16px;
  width: 352px;
  max-height: calc(100% - 32px);
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  pointer-events: none;
}

.eco-left-column > * {
  pointer-events: auto;
}

.eco-site-switcher {
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  color: #24333a;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid #d6e0e3;
  border-radius: 4px;
  box-shadow: 0 2px 10px rgba(24, 62, 72, 0.08);
}

.eco-search-panel {
  width: 100%;
  padding: 12px;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid #d6e0e3;
  border-radius: 4px;
  box-shadow: 0 2px 14px rgba(24, 62, 72, 0.1);
}

.eco-search-title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 10px;
  color: #1d2c33;
  font-weight: 700;
}

.eco-search-panel .tree-search {
  width: 100%;
}

.eco-benefit-panel {
  width: 100%;
  padding: 14px;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid #d6e0e3;
  border-radius: 4px;
  box-shadow: 0 2px 14px rgba(24, 62, 72, 0.1);
}

.eco-benefit-scope {
  margin-left: auto;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.eco-benefit-total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  padding: 10px 12px;
  color: #15323b;
  background: #eef7f8;
  border: 1px solid #d3e6e9;
  border-radius: 4px;
}

.eco-benefit-total span {
  color: #5d7078;
  font-size: 13px;
  font-weight: 600;
}

.eco-benefit-total strong {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 18px;
}

.eco-benefit-rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.eco-benefit-row {
  display: grid;
  grid-template-columns: 1fr 120px;
  gap: 10px;
  align-items: center;
  padding: 8px 10px;
  background: #f7fafb;
  border: 1px solid #e4ecef;
  border-radius: 4px;
}

.eco-benefit-metric span,
.eco-benefit-value span {
  display: block;
  color: #5d7078;
  font-size: 12px;
}

.eco-benefit-metric strong,
.eco-benefit-value strong {
  display: block;
  margin-top: 2px;
  color: #15323b;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 14px;
  line-height: 1.25;
  word-break: break-word;
}

.eco-benefit-metric small {
  color: #77878e;
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
}

.eco-benefit-value strong {
  color: #0e7c86;
}

.eco-filter-panel {
  width: 100%;
}

.eco-filter-panel :deep(.map-panel) {
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid #d6e0e3;
  border-radius: 4px;
  box-shadow: 0 2px 14px rgba(24, 62, 72, 0.1);
}

.eco-filter-panel :deep(.ant-card-body) {
  padding: 14px;
}

.eco-summary-panel {
  position: absolute;
  z-index: 15;
  top: 16px;
  right: 16px;
  width: 318px;
  max-height: calc(100% - 32px);
  padding: 16px;
  overflow-y: auto;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid #d6e0e3;
  border-radius: 4px;
  box-shadow: 0 2px 14px rgba(24, 62, 72, 0.1);
}

.eco-panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  color: #1d2c33;
  font-size: 16px;
  font-weight: 700;
}

.eco-panel-title svg {
  color: #0e7c86;
}

.eco-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.eco-summary-item {
  padding: 12px;
  background: #f4f9fa;
  border: 1px solid #dce8eb;
  border-radius: 4px;
}

.eco-summary-item strong {
  display: block;
  color: #15323b;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 18px;
  line-height: 1.25;
  word-break: break-word;
}

.eco-summary-item span {
  display: block;
  margin-top: 4px;
  color: #5d7078;
  font-size: 12px;
}

.eco-legend {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid #e4ecef;
}

.eco-legend-title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 10px;
  color: #33474f;
  font-size: 13px;
  font-weight: 700;
}

.eco-legend-list {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
}

.eco-legend-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  color: #5d7078;
  font-size: 12px;
}

.eco-legend-swatch {
  width: 100%;
  height: 18px;
  border: 1px solid rgba(255, 255, 255, 0.9);
  border-radius: 2px;
}

.eco-drawer-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
  padding: 10px 12px;
  color: #43575f;
  background: #f4f9fa;
  border: 1px solid #dce8eb;
  border-radius: 4px;
  font-size: 13px;
}

.eco-tree-table {
  margin-bottom: 14px;
}

.eco-drawer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.eco-drawer-actions span {
  color: #5d7078;
  font-size: 13px;
}

.eco-submit-result {
  margin-top: 4px;
}

@media (max-width: 860px) {
  .eco-value-page {
    height: auto;
    overflow: visible;
  }

  .eco-value-page :deep(.eco-map-canvas) {
    height: 56vh;
    min-height: 420px;
  }

  .eco-loading-mask {
    position: absolute;
    height: 56vh;
    min-height: 420px;
  }

  .eco-left-column,
  .eco-summary-panel {
    position: static;
    width: auto;
    max-width: none;
    max-height: none;
    margin: 12px;
  }

  .eco-left-column {
    margin-top: 0;
    gap: 10px;
    overflow: visible;
  }

  .eco-site-switcher,
  .eco-filter-panel {
    margin: 0;
  }

  .eco-summary-panel {
    margin-top: 0;
  }
}
</style>
