<script setup>
import { inject } from "vue";
import { Leaf, BookOpen, CalendarDays, Users, Search } from "lucide-vue-next";
import ArcGISTreeMap from "../components/ArcGISTreeMap.vue";
import FilterPanel from "../components/FilterPanel.vue";
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
        <a-button type="link" @click="navigateTo('dashboard')">查看树木统计</a-button>
        <a-button v-if="role !== 'visitor'" type="link" @click="navigateTo('workbench')">进入工单处理</a-button>
      </a-space>
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

    <!-- Census Callout -->
    <section class="home-section census-callout">
      <div class="callout-icon"><Leaf :size="34" /></div>
      <div>
        <h2>大兴善寺树木普查</h2>
        <p>已整理 437 条树木记录，用于支撑地图展示、导览推荐和养护管理。</p>
        <a-button type="primary" @click="navigateTo('guide')">参与导览</a-button>
      </div>
    </section>

    <!-- Citywide Statistics -->

    <!-- Recent Activities -->
    <section class="home-section activity-section">
      <h2>Recent Tree Care Activities</h2>
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
</template>
