<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { message } from "ant-design-vue";
import { ChevronDown, ChevronLeft, ChevronRight, Leaf, MapPin, Search, Sparkles } from "lucide-vue-next";
import EcoValueMap from "../components/EcoValueMap.vue";
import EcoSpeciesSymbol from "../components/EcoSpeciesSymbol.vue";
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
import { TREE_VALUE_SIZE_STOPS } from "../utils/ecoSymbols";

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
const speciesLegendExpanded = ref(false);
const ECO_RIGHT_PANEL_KEY = "xian-eco-right-panel-collapsed";
const rightPanelCollapsed = ref(
  window.localStorage.getItem(ECO_RIGHT_PANEL_KEY) === "true"
);
const treeSymbolScale = ref(100);
const autoScaleTreeSymbols = ref(true);

watch(rightPanelCollapsed, (collapsed) => {
  window.localStorage.setItem(ECO_RIGHT_PANEL_KEY, String(collapsed));
});

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
    : sumEcoBenefits(visibleTrees.value)
);

const benefitScopeLabel = computed(() =>
  selectedTree.value
    ? `${selectedTree.value.code} / ${selectedTree.value.species}`
    : visibleTrees.value.length === siteTrees.value.length
      ? "全部树木"
      : `当前筛选 ${visibleTrees.value.length} 棵`
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

const speciesLegend = computed(() => {
  const counts = new Map();
  siteTrees.value.forEach((tree) => {
    counts.set(tree.species, (counts.get(tree.species) ?? 0) + 1);
  });
  return Array.from(counts, ([species, count]) => ({ species, count })).sort(
    (a, b) => b.count - a.count || a.species.localeCompare(b.species, "zh-Hans-CN")
  );
});

const displayedSpeciesLegend = computed(() =>
  speciesLegendExpanded.value ? speciesLegend.value : speciesLegend.value.slice(0, 6)
);

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

function toggleSpeciesFilter(species) {
  speciesFilter.value = speciesFilter.value.includes(species)
    ? speciesFilter.value.filter((item) => item !== species)
    : [...speciesFilter.value, species];
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
  <div class="eco-value-page" :class="`health-tone-${healthFilter}`">
    <EcoValueMap
      ref="ecoMapRef"
      :trees="visibleTrees"
      :grids="gridFeatures"
      :symbol-scale="treeSymbolScale"
      :auto-scale="autoScaleTreeSymbols"
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
          <span>五项年生态价值合计</span>
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
              <span>{{ metric.includedInTotal === false ? '单列价值（不计入合计）' : '计入合计' }}</span>
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
          eco-symbol-mode
          interactive-legend
          @species-change="speciesFilter = $event"
          @dbh-range-change="dbhRange = $event"
          @health-change="healthFilter = $event"
          @reset="resetFilters()"
        />
      </div>
    </div>

    <aside class="eco-summary-panel" :class="{ 'is-collapsed': rightPanelCollapsed }">
      <div class="eco-panel-title">
        <Sparkles :size="18" />
        <span>生态效益热点与重点保护</span>
        <button
          type="button"
          class="panel-collapse-button"
          aria-label="收起右侧图例栏"
          title="收起图例栏"
          @click="rightPanelCollapsed = true"
        >
          <ChevronRight :size="18" />
        </button>
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
          <span>网格总价值等级</span>
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

      <div class="eco-legend eco-tree-legend">
        <button
          type="button"
          class="eco-legend-toggle"
          :aria-expanded="speciesLegendExpanded"
          @click="speciesLegendExpanded = !speciesLegendExpanded"
        >
          <span class="eco-legend-title">
            <Leaf :size="15" />
            <span>树木点位图例</span>
          </span>
          <span class="eco-legend-toggle-copy">
            {{ speciesLegendExpanded ? '收起' : `全部 ${speciesLegend.length} 种` }}
            <ChevronDown :size="15" :class="{ open: speciesLegendExpanded }" />
          </span>
        </button>

        <p class="eco-legend-note">颜色与形状表示树种，点击可同步筛选。</p>
        <div class="eco-species-legend-list">
          <button
            v-for="item in displayedSpeciesLegend"
            :key="item.species"
            type="button"
            class="eco-species-legend-item"
            :class="{ active: speciesFilter.includes(item.species) }"
            :aria-pressed="speciesFilter.includes(item.species)"
            @click="toggleSpeciesFilter(item.species)"
          >
            <EcoSpeciesSymbol :species="item.species" :size="13" />
            <span>{{ item.species }}</span>
            <small>{{ item.count }}</small>
          </button>
        </div>

        <div class="eco-size-legend">
          <div class="eco-legend-title">点位大小 · 五项生态价值合计</div>
          <div class="eco-size-legend-list">
            <div v-for="stop in TREE_VALUE_SIZE_STOPS" :key="stop.key" class="eco-size-legend-item">
              <span class="eco-size-marker-wrap">
                <span
                  class="eco-size-marker"
                  :style="{ width: `${stop.size}px`, height: `${stop.size}px` }"
                />
              </span>
              <span><strong>{{ stop.label }}</strong><small>{{ stop.range }}</small></span>
            </div>
          </div>

          <div class="eco-symbol-controls">
            <div class="eco-symbol-control-head">
              <span>整体大小</span>
              <strong>{{ treeSymbolScale }}%</strong>
            </div>
            <div class="eco-symbol-slider-row">
              <span>−</span>
              <a-slider v-model:value="treeSymbolScale" :min="70" :max="180" :step="10" />
              <span>＋</span>
            </div>
            <div class="eco-symbol-auto-row">
              <span>
                <strong>自动随缩放调整</strong>
                <small>缩小地图时自动增强点位可见性</small>
              </span>
              <a-switch v-model:checked="autoScaleTreeSymbols" size="small" />
            </div>
            <button
              type="button"
              class="eco-symbol-reset"
              @click="treeSymbolScale = 100; autoScaleTreeSymbols = true"
            >
              恢复默认
            </button>
          </div>
        </div>
      </div>
    </aside>

    <button
      v-if="rightPanelCollapsed"
      type="button"
      class="right-panel-restore eco-panel-restore"
      aria-label="展开右侧图例栏"
      @click="rightPanelCollapsed = false"
    >
      <ChevronLeft :size="17" />
      <span>图例</span>
    </button>

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

.eco-value-page::after {
  position: absolute;
  z-index: 14;
  inset: 0;
  pointer-events: none;
  content: "";
  box-shadow: inset 0 0 0 rgba(0, 0, 0, 0);
  transition: box-shadow 0.22s ease;
}

.eco-value-page.health-tone-healthy::after {
  box-shadow:
    inset 0 0 20px rgba(68, 135, 61, 0.5),
    inset 0 0 58px rgba(68, 135, 61, 0.28),
    inset 0 0 112px rgba(68, 135, 61, 0.16);
}

.eco-value-page.health-tone-warning::after {
  box-shadow:
    inset 0 0 20px rgba(190, 108, 0, 0.6),
    inset 0 0 58px rgba(190, 108, 0, 0.36),
    inset 0 0 112px rgba(190, 108, 0, 0.2);
}

.eco-value-page.health-tone-problem::after {
  box-shadow:
    inset 0 0 20px rgba(180, 55, 48, 0.51),
    inset 0 0 58px rgba(180, 55, 48, 0.29),
    inset 0 0 112px rgba(180, 55, 48, 0.17);
}

.health-tone-healthy .eco-filter-panel :deep(.ant-segmented-item-selected) {
  color: #2e6f36;
  background: #e8f4e4;
}

.health-tone-warning .eco-filter-panel :deep(.ant-segmented-item-selected) {
  color: #754200;
  background: #ffe7bd;
}

.health-tone-problem .eco-filter-panel :deep(.ant-segmented-item-selected) {
  color: #8f302b;
  background: #fde8e5;
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
  transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.18s ease;
}

.eco-summary-panel.is-collapsed {
  opacity: 0;
  pointer-events: none;
  transform: translateX(calc(100% + 32px));
}

.eco-panel-restore {
  top: 16px;
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

.eco-tree-legend {
  padding-bottom: 2px;
}

.eco-legend-toggle {
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: inherit;
  cursor: pointer;
}

.eco-legend-toggle .eco-legend-title {
  margin-bottom: 0;
}

.eco-legend-toggle-copy {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: #5d7078;
  font-size: 11px;
}

.eco-legend-toggle-copy svg {
  transition: transform 0.2s ease;
}

.eco-legend-toggle-copy svg.open {
  transform: rotate(180deg);
}

.eco-legend-note {
  margin: 9px 0;
  color: #5d7078;
  font-size: 11px;
  line-height: 1.55;
}

.eco-species-legend-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.eco-species-legend-item {
  min-width: 0;
  min-height: 32px;
  padding: 5px 7px;
  border: 1px solid #dce8eb;
  border-radius: 3px;
  background: #ffffff;
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  color: #33474f;
  cursor: pointer;
  text-align: left;
}

.eco-species-legend-item:hover,
.eco-species-legend-item.active {
  color: var(--nyc-green-dark);
  background: var(--nyc-light-green);
  border-color: var(--nyc-green);
}

.eco-species-legend-item > span:not(.eco-species-symbol) {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.eco-species-legend-item small {
  color: #77878e;
  font-family: var(--font-mono);
  font-size: 11px;
}

.eco-size-legend {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e4ecef;
}

.eco-size-legend .eco-legend-title {
  margin-bottom: 9px;
}

.eco-size-legend-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.eco-size-legend-item {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 5px;
}

.eco-size-marker-wrap {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  flex: 0 0 24px;
}

.eco-size-marker {
  display: block;
  border: 2px solid #ffffff;
  border-radius: 50%;
  background: #0e7c86;
  box-shadow: 0 0 0 1px #78939c;
}

.eco-size-legend-item strong,
.eco-size-legend-item small {
  display: block;
  line-height: 1.25;
}

.eco-size-legend-item strong {
  color: #33474f;
  font-size: 11px;
}

.eco-size-legend-item small {
  color: #77878e;
  font-size: 11px;
  white-space: nowrap;
}

.eco-symbol-controls {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e4ecef;
}

.eco-symbol-control-head,
.eco-symbol-auto-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.eco-symbol-control-head {
  color: #33474f;
  font-size: 12px;
}

.eco-symbol-control-head strong {
  color: var(--nyc-green-dark);
  font-family: var(--font-mono);
  font-size: 12px;
}

.eco-symbol-slider-row {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr) 14px;
  align-items: center;
  gap: 6px;
  color: #5d7078;
}

.eco-symbol-slider-row :deep(.ant-slider) {
  margin: 11px 2px;
}

.eco-symbol-auto-row {
  margin-top: 5px;
}

.eco-symbol-auto-row > span:first-child {
  min-width: 0;
}

.eco-symbol-auto-row strong,
.eco-symbol-auto-row small {
  display: block;
}

.eco-symbol-auto-row strong {
  color: #33474f;
  font-size: 12px;
}

.eco-symbol-auto-row small {
  margin-top: 2px;
  color: #77878e;
  font-size: 11px;
  line-height: 1.4;
}

.eco-symbol-reset {
  margin-top: 9px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--nyc-green-dark);
  font-size: 11px;
  cursor: pointer;
}

.eco-symbol-reset:hover {
  text-decoration: underline;
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

  .eco-summary-panel.is-collapsed {
    opacity: 1;
    pointer-events: auto;
    transform: none;
  }

  .eco-summary-panel .panel-collapse-button,
  .eco-panel-restore {
    display: none;
  }
}
</style>
