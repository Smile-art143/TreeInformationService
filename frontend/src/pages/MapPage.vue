<script setup>
import { computed, inject, ref, watch } from "vue";
import { message } from "ant-design-vue";
import { ChevronLeft, ChevronRight, Leaf, BookOpen, CalendarDays, Users, Search, X } from "lucide-vue-next";
import ArcGISTreeMap from "../components/ArcGISTreeMap.vue";
import FilterPanel from "../components/FilterPanel.vue";
import StatsPanel from "../components/StatsPanel.vue";
import { computeNextTreeCode, roleLabels } from "../api/mockApi";
import { exportTreesAsShp } from "../api/shpExport";

const app = inject("appState");

const {
  role, organizationName, roleOptions,
  trees, filteredTrees, speciesColors, treeSearchOptions,
  speciesFilter, dbhRange, healthFilter,
  recentWorkOrders, topSpecies, stats,
  homePanelWidth,
  panelMinWidth, panelDefaultWidth, panelMaxWidth,
  setSelectedTree, focusTree, resetMapFilters,
  setSpeciesFilter, setDbhRange, setHealthFilter,
  setHomePanelWidth, setIsResizingHomePanel,
  navigateTo, workOrders, selectedTree,
  addTree,
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

// ---- 导出树木点位 SHP ----
const handleExportShp = () => {
  try {
    exportTreesAsShp(trees.value);
    message.success("已导出树木点位 SHP 数据");
  } catch (error) {
    message.error(error.message || "导出失败");
  }
};

// ---- stats modal ----
const showStatsModal = ref(false);
const MAP_RIGHT_PANEL_KEY = "xian-map-right-panel-collapsed";
const rightPanelCollapsed = ref(
  window.localStorage.getItem(MAP_RIGHT_PANEL_KEY) === "true"
);

watch(rightPanelCollapsed, (collapsed) => {
  window.localStorage.setItem(MAP_RIGHT_PANEL_KEY, String(collapsed));
});

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

// ---- add tree drawer ----
const showAddTreeDrawer = ref(false);
const addTreeForm = ref({
  species: "",
  locationDescription: "",
  dbh: null,
  longitude: "",
  latitude: "",
  treeType: "普通树",
  protectionLevel: null,
  healthStatus: "healthy",
  story: "",
});
const addTreePhotos = ref([]);

const nextTreeCode = computed(() => computeNextTreeCode(trees.value));

const treeTypeOptions = [
  { label: "普通树", value: "普通树" },
  { label: "古树", value: "古树" },
];

const protectionLevelOptions = [
  { label: "一级保护", value: "一级保护" },
  { label: "二级保护", value: "二级保护" },
  { label: "三级保护", value: "三级保护" },
];

const healthStatusOptions = [
  { label: "正常", value: "healthy" },
  { label: "异常", value: "problem" },
];

const toPhotoRecords = (fileList) =>
  fileList.map((file) => ({
    uid: file.uid,
    name: file.name,
    url: file.url || file.thumbUrl || (file.originFileObj ? URL.createObjectURL(file.originFileObj) : ""),
  }));

const openAddTreeDrawer = () => {
  addTreeForm.value = {
    species: "",
    locationDescription: "",
    dbh: null,
    longitude: "",
    latitude: "",
    treeType: "普通树",
    protectionLevel: null,
    healthStatus: "healthy",
    story: "",
  };
  addTreePhotos.value = [];
  showAddTreeDrawer.value = true;
};

const handleAddTree = () => {
  if (!addTreeForm.value.species.trim()) {
    message.error("请输入树种名称");
    return;
  }
  if (!addTreeForm.value.longitude || !addTreeForm.value.latitude) {
    message.error("请输入坐标");
    return;
  }
  const photos = toPhotoRecords(addTreePhotos.value);
  addTree({
    ...addTreeForm.value,
    photos,
  });
  showAddTreeDrawer.value = false;
  message.success("树木已添加");
};

watch(() => addTreeForm.value.treeType, (val) => {
  if (val === "普通树") {
    addTreeForm.value.protectionLevel = null;
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
        <a-button v-if="role === 'admin'" type="link" @click="handleExportShp">导出树木shp数据</a-button>
        <a-button v-if="role === 'inspector' || role === 'maintenance'" type="link" @click="openAddTreeDrawer">添加树木</a-button>
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

 <!-- Split Actions -->


    <!-- 生态效益估算 -->
    <section v-if="role !== 'admin'" class="home-section eco-section">
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
    

   

    <!-- Role Note -->
    <section v-if="role !== 'admin'" class="home-section role-note">
      <Users :size="18" />
      <span>
        <template v-if="role === 'visitor'">游客可查看树木详情、浏览导览路线并提交游客线索。</template>
        <template v-if="role === 'inspector'">巡检人员可查看游客线索、创建工单、更新健康状态并复核归档。</template>
        <template v-if="role === 'maintenance'">养护人员可创建工单、处置待处理任务并更新健康状态。</template>
      </span>
    </section>
  </div>

  <!-- Map Tool Panel (right sidebar) -->
  <div class="map-tool-panel" :class="{ 'is-collapsed': rightPanelCollapsed }">
    <div class="tool-panel-title">
      <Search :size="17" />
      <span>Find A Tree</span>
      <button
        type="button"
        class="panel-collapse-button"
        aria-label="收起右侧筛选栏"
        title="收起筛选栏"
        @click="rightPanelCollapsed = true"
      >
        <ChevronRight :size="18" />
      </button>
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

  <button
    v-if="rightPanelCollapsed"
    type="button"
    class="right-panel-restore map-panel-restore"
    aria-label="展开右侧筛选栏"
    @click="rightPanelCollapsed = false"
  >
    <ChevronLeft :size="17" />
    <span>筛选</span>
  </button>

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

  <!-- Add Tree Drawer -->
  <a-drawer
    :width="430"
    :open="showAddTreeDrawer"
    @close="showAddTreeDrawer = false"
    title="添加树木"
  >
    <a-space direction="vertical" :size="16" class="full-width">
      <a-form layout="vertical" :model="addTreeForm">
        <a-form-item label="编号">
          <a-input :value="nextTreeCode" disabled />
        </a-form-item>

        <a-form-item label="树种名称" required>
          <a-input v-model:value="addTreeForm.species" placeholder="例如：银杏、国槐" />
        </a-form-item>

        <a-form-item label="位置">
          <a-input v-model:value="addTreeForm.locationDescription" placeholder="例如：山门东侧第三排" />
        </a-form-item>

        <a-form-item label="胸径 (cm)">
          <a-input-number
            v-model:value="addTreeForm.dbh"
            :min="0"
            :step="0.1"
            style="width: 100%"
            placeholder="例如：35.5"
          />
        </a-form-item>

        <a-form-item label="坐标" required>
          <a-space>
            <a-input
              v-model:value="addTreeForm.longitude"
              placeholder="经度 (longitude)"
              style="width: 190px"
            />
            <a-input
              v-model:value="addTreeForm.latitude"
              placeholder="纬度 (latitude)"
              style="width: 190px"
            />
          </a-space>
        </a-form-item>

        <a-form-item label="类型">
          <a-select
            v-model:value="addTreeForm.treeType"
            :options="treeTypeOptions"
          />
        </a-form-item>

        <a-form-item v-if="addTreeForm.treeType === '古树'" label="保护等级">
          <a-select
            v-model:value="addTreeForm.protectionLevel"
            :options="protectionLevelOptions"
            placeholder="请选择保护等级"
          />
        </a-form-item>

        <a-form-item label="资料卡片">
          <a-textarea
            v-model:value="addTreeForm.story"
            :rows="3"
            placeholder="树木的历史背景、文化故事等"
          />
        </a-form-item>

        <a-form-item label="健康状态">
          <a-select
            v-model:value="addTreeForm.healthStatus"
            :options="healthStatusOptions"
          />
        </a-form-item>

        <a-form-item label="树木照片">
          <a-upload
            v-model:file-list="addTreePhotos"
            :before-upload="() => false"
            :max-count="3"
            list-type="picture"
          >
            <a-button>选择照片</a-button>
          </a-upload>
        </a-form-item>

        <a-form-item>
          <a-button type="primary" block @click="handleAddTree">添加</a-button>
        </a-form-item>
      </a-form>
    </a-space>
  </a-drawer>
</template>
