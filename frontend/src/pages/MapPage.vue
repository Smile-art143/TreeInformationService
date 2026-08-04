<script setup>
import { inject, ref, watch } from "vue";
import { Leaf, BookOpen, CalendarDays, Users, Search, X } from "lucide-vue-next";
import ArcGISTreeMap from "../components/ArcGISTreeMap.vue";
import FilterPanel from "../components/FilterPanel.vue";
import StatsPanel from "../components/StatsPanel.vue";
import { roleLabels } from "../api/mockApi";

const app = inject("appState");

const {
  isEnglish, role, organizationName, roleOptions,
  trees, filteredTrees, speciesColors, treeSearchOptions,
  speciesFilter, dbhRange, healthFilter,
  recentWorkOrders, topSpecies, stats,
  homePanelWidth,
  panelMinWidth, panelDefaultWidth, panelMaxWidth,
  setSelectedTree, focusTree, resetMapFilters,
  setSpeciesFilter, setDbhRange, setHealthFilter,
  setHomePanelWidth, setIsResizingHomePanel,
  navigateTo, workOrders, selectedTree,
} = app;

const handleResizerMouseDown = (event) => {
  event.preventDefault();
  setIsResizingHomePanel(true);
};

const handleResizerDoubleClick = () => {
  setHomePanelWidth(panelDefaultWidth);
};

const handleResizerKeyDown = (event) => {
  if (event.key === "ArrowLeft") setHomePanelWidth(Math.max(panelMinWidth, homePanelWidth.value - 24));
  if (event.key === "ArrowRight") setHomePanelWidth(Math.min(panelMaxWidth, homePanelWidth.value + 24));
  if (event.key === "Home") setHomePanelWidth(panelMinWidth);
  if (event.key === "End") setHomePanelWidth(panelDefaultWidth);
};

const onTreeSelect = (tree) => {
  setSelectedTree(tree);
};

const handleFocusTree = (treeId) => {
  focusTree(treeId);
};

const onSpeciesChange = (val) => setSpeciesFilter(val);
const onDbhRangeChange = (val) => setDbhRange(val);
const onHealthChange = (val) => setHealthFilter(val);
const onReset = () => resetMapFilters();

// ---- stats modal ----
const showStatsModal = ref(false);

const openStatsModal = () => {
  showStatsModal.value = true;
};

const closeStatsModal = () => {
  showStatsModal.value = false;
};

const onModalBackdropClick = (event) => {
  if (event.target === event.currentTarget) {
    closeStatsModal();
  }
};

const onModalKeydown = (event) => {
  if (event.key === "Escape") {
    closeStatsModal();
  }
};

watch(showStatsModal, (val) => {
  if (val) {
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onModalKeydown);
  } else {
    document.body.style.overflow = "";
    window.removeEventListener("keydown", onModalKeydown);
  }
});
</script>

<template>
  <ArcGISTreeMap
    :trees="filteredTrees"
    :selected-tree="selectedTree"
    :species-colors="speciesColors"
    @tree-select="onTreeSelect"
  />

  <!-- Home Panel (left sidebar) -->
  <div class="home-panel" :style="{ width: homePanelWidth + 'px' }">
    <button
      type="button"
      class="home-panel-resizer"
      aria-label="调整左侧栏宽度"
      title="拖拽调整宽度，双击恢复默认"
      @mousedown="handleResizerMouseDown"
      @dblclick="handleResizerDoubleClick"
      @keydown="handleResizerKeyDown"
    />

    <!-- Hero Copy -->
    <section class="home-section hero-copy">
      <a-tag color="green">
        {{ roleOptions.find((item) => item.value === role)?.label ?? roleLabels[role] }}
      </a-tag>
      <a-tag>{{ organizationName }}</a-tag>
      <h1>西安城市树木</h1>
      <p>点击地图上的树木点位查看完整档案，使用筛选器按树种、胸径和健康状态缩小范围。</p>
      <a-space wrap class="home-links">
        <a-button type="link" @click="openStatsModal">查看树木统计</a-button>
        <a-button v-if="role !== 'visitor'" type="link" @click="navigateTo('workbench')">进入工单处理</a-button>
      </a-space>
    </section>

    <!-- Citywide Statistics -->
    <section class="home-section stats-section">
      <h2>城市树木概览</h2>
      <div class="city-stat-grid">
        <div class="stat-card">
          <strong>{{ stats.totalTrees.toLocaleString() }}</strong>
          <span>树木入图</span>
        </div>
        <div class="stat-card">
          <strong>{{ workOrders.length.toLocaleString() }}</strong>
          <span>养护记录</span>
        </div>
        <div class="stat-card">
          <strong>{{ trees.filter((tree) => tree.isAncient).length.toLocaleString() }}</strong>
          <span>古树名木</span>
        </div>
        <div class="stat-card">
          <strong>{{ stats.speciesCount.toLocaleString() }}</strong>
          <span>树种数量</span>
        </div>
      </div>
    </section>

 <!-- Split Actions -->
    <section class="home-section split-actions">
      <div>
        <h2>Learn</h2>
        <p>查看树种图鉴、季节提示和游客打卡入口。</p>
        <a-button type="link" @click="navigateTo('guide')"><BookOpen :size="16" />导览学习</a-button>
      </div>
      <div>
        <h2>Find Routes</h2>
        <p>按拍照、秋季观赏和巡检任务查看推荐路线。</p>
        <a-button type="link" @click="navigateTo('routes')"><CalendarDays :size="16" />路线推荐</a-button>
      </div>
    </section>

    <!-- 生态效益估算 -->
    <section class="home-section eco-section">
      <h2>生态效益</h2>
      <div class="eco-stat-grid">
        <div class="eco-stat-card">
          <span class="eco-stat-value">{{ stats.ecologicalBenefits.stormwaterIntercepted.toLocaleString() }} <small>L</small></span>
          <span class="eco-stat-label">年雨水截留估算</span>
        </div>
        <div class="eco-stat-card">
          <span class="eco-stat-value">{{ stats.ecologicalBenefits.carbonSequestration.toLocaleString() }} <small>kg</small></span>
          <span class="eco-stat-label">年固碳</span>
        </div>
        <div class="eco-stat-card">
          <span class="eco-stat-value">{{ stats.ecologicalBenefits.oxygenProduction.toLocaleString() }} <small>kg</small></span>
          <span class="eco-stat-label">年产氧</span>
        </div>
        <div class="eco-stat-card">
          <span class="eco-stat-value">{{ stats.ecologicalBenefits.airPollutionRemoved.toLocaleString() }} <small>kg</small></span>
          <span class="eco-stat-label">空气污染物移除</span>
        </div>
      </div>
    </section>
    <!-- Recent Activities -->
    <section v-if="role !== 'visitor'" class="home-section activity-section">
      <h2>树木养护活动</h2>
      <button
        v-for="order in recentWorkOrders"
        :key="order.id"
        type="button"
        class="activity-item"
        @click="handleFocusTree(order.treeId)"
      >
        <span>{{ order.createdAt }}</span>
        <p>
          {{ order.creatorName ?? roleLabels[order.creatorRole] }} 创建了
          {{ (() => { const t = trees.find((item) => item.id === order.treeId); return t ? `${t.species} ${t.code}` : order.treeId; })() }}
          的{{ order.issueType }}工单。
        </p>
      </button>
    </section>

   

    <!-- Role Note -->
    <section class="home-section role-note">
      <Users :size="18" />
      <span>
        <template v-if="role === 'visitor'">游客可查看树木详情、浏览导览路线并提交游客线索。</template>
        <template v-if="role === 'inspector'">巡检人员可查看游客线索、创建工单、更新健康状态并复核归档。</template>
        <template v-if="role === 'maintenance'">养护人员可创建工单、处置待处理任务并更新健康状态。</template>
      </span>
    </section>
  </div>

  <!-- Map Tool Panel (right sidebar) -->
  <div class="map-tool-panel">
    <div class="tool-panel-title">
      <Search :size="17" />
      <span>Find A Tree</span>
    </div>
    <a-auto-complete
      class="tree-search"
      :options="treeSearchOptions"
      @select="handleFocusTree"
      :filter-option="(input, option) => String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())"
      placeholder="搜索树木编号或树种，如 DX-1 / 银杏"
      allow-clear
    />
    <FilterPanel
      :trees="trees"
      :filtered-count="filteredTrees.length"
      :species-filter="speciesFilter"
      :dbh-range="dbhRange"
      :health-filter="healthFilter"
      :species-colors="speciesColors"
      @species-change="onSpeciesChange"
      @dbh-range-change="onDbhRangeChange"
      @health-change="onHealthChange"
      @reset="onReset"
    />
  </div>

  <!-- Map Key -->
  <div class="map-key" :style="{ left: (homePanelWidth + 64) + 'px' }">
    <div class="map-key-title">树种 / 胸径图例</div>
    <p>颜色表示树种，点大小表示胸径。点击树木查看详情。</p>
    <div class="map-key-row"><span class="size-dot small" /> 小胸径</div>
    <div class="map-key-row"><span class="size-dot medium" /> 中胸径</div>
    <div class="map-key-row"><span class="size-dot large" /> 大胸径</div>
  </div>

  <!-- Stats Modal -->
  <Teleport to="body">
    <Transition name="stats-modal">
      <div
        v-if="showStatsModal"
        class="stats-modal-backdrop"
        @click="onModalBackdropClick"
      >
        <div class="stats-modal-container">
          <button
            type="button"
            class="stats-modal-close"
            aria-label="关闭统计面板"
            title="关闭 (Esc)"
            @click="closeStatsModal"
          >
            <X :size="20" />
          </button>
          <StatsPanel :stats="stats" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
