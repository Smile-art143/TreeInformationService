<script setup>
import { ref, computed, watch, provide, onUnmounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import {
  Trees, MapPinned, BarChart3, ClipboardList, Compass, Route as RouteIcon,
  Type, Languages, LogOut
} from "lucide-vue-next";
import LoginPage from "./components/LoginPage.vue";
import TreeDetailDrawer from "./components/TreeDetailDrawer.vue";
import {
  buildStats,
  createInitialWorkOrders,
  getSpeciesColorMap,
  roleLabels,
  trees as initialTrees,
} from "./api/mockApi";

// ---- router ----
const router = useRouter();
const route = useRoute();

// ---- state (was useState) ----
const isAuthenticated = ref(false);
const role = ref("admin");
const organizationName = ref("大兴善寺管理处");
const page = ref("map");
const trees = ref([...initialTrees]);
const speciesFilter = ref([]);
const initialMaxDbh = Math.ceil(Math.max(...initialTrees.map((tree) => tree.dbh), 100));
const dbhRange = ref([0, initialMaxDbh]);
const healthFilter = ref("all");
const selectedTree = ref(null);
const workOrders = ref(createInitialWorkOrders(initialTrees));
const selectedOrder = ref(null);
const textSize = ref("default");
const language = ref("zh");
const homePanelWidth = ref(496);
const isResizingHomePanel = ref(false);

// ---- constants ----
const panelMinWidth = 360;
const panelDefaultWidth = 496;
const panelMaxWidth = 680;

// ---- computed (was useMemo) ----
const isEnglish = computed(() => language.value === "en");

const roleOptions = computed(() => [
  { label: isEnglish.value ? "Visitor" : "游客", value: "visitor" },
  { label: isEnglish.value ? "Admin" : "管理员", value: "admin" },
  { label: isEnglish.value ? "Inspector" : "巡检人员", value: "inspector" },
  { label: isEnglish.value ? "Maintenance" : "养护人员", value: "maintenance" },
]);

const speciesColors = computed(() => getSpeciesColorMap(trees.value));

const navOptions = computed(() => [
  { label: isEnglish.value ? "Map" : "地图", value: "map" },
  { label: isEnglish.value ? "Stats" : "统计", value: "dashboard" },
  { label: isEnglish.value ? "Work Orders" : "工单", value: "workbench", disabled: role.value === "visitor" },
  { label: isEnglish.value ? "Guide" : "导览", value: "guide" },
  { label: isEnglish.value ? "Routes" : "路线", value: "routes" },
]);

const filteredTrees = computed(() => {
  return trees.value.filter((tree) => {
    const speciesMatched = speciesFilter.value.length === 0 || speciesFilter.value.includes(tree.species);
    const dbhMatched = tree.dbh >= dbhRange.value[0] && tree.dbh <= dbhRange.value[1];
    const healthMatched = healthFilter.value === "all" || tree.healthStatus === healthFilter.value;
    return speciesMatched && dbhMatched && healthMatched;
  });
});

const stats = computed(() => buildStats(trees.value));

const treeSearchOptions = computed(() =>
  trees.value.map((tree) => ({
    value: tree.id,
    label: `${tree.code} / ${tree.species} / ${tree.dbh || "未记录"}cm`,
  }))
);

const recentWorkOrders = computed(() => workOrders.value.slice(0, 3));
const topSpecies = computed(() => stats.value.speciesRatio[0]);

// ---- sync route with page state ----
watch(() => route.path, (path) => {
  const pageName = path.replace("/", "") || "map";
  if (["map", "dashboard", "workbench", "guide", "routes"].includes(pageName)) {
    page.value = pageName;
  }
});

// ---- actions ----
const updateTree = (nextTree) => {
  trees.value = trees.value.map((tree) => (tree.id === nextTree.id ? nextTree : tree));
  selectedTree.value = nextTree;
};

const createWorkOrder = (order) => {
  workOrders.value = [order, ...workOrders.value];
  if (role.value !== "visitor") {
    router.push("/workbench");
  }
};

const focusTree = (treeId) => {
  const tree = trees.value.find((item) => item.id === treeId);
  if (!tree) return;
  speciesFilter.value = [];
  dbhRange.value = [0, initialMaxDbh];
  healthFilter.value = "all";
  selectedTree.value = tree;
  router.push("/map");
};

const resetMapFilters = () => {
  speciesFilter.value = [];
  dbhRange.value = [0, initialMaxDbh];
  healthFilter.value = "all";
};

const updateWorkOrder = (nextOrder) => {
  workOrders.value = workOrders.value.map((order) => (order.id === nextOrder.id ? nextOrder : order));
  selectedOrder.value = nextOrder;
};

const navigateTo = (targetPage) => {
  router.push(`/${targetPage}`);
};

// ---- watchers (was useEffect) ----
watch([page, role], ([newPage, newRole]) => {
  if (newRole === "visitor" && newPage === "workbench") {
    router.push("/map");
  }
});

// ---- resize handler ----
let onMouseMove = null;
let onMouseUp = null;

watch(isResizingHomePanel, (val) => {
  if (val) {
    onMouseMove = (event) => {
      const viewportLimit = Math.max(panelMinWidth, window.innerWidth - 560);
      const nextWidth = Math.min(
        Math.max(event.clientX - 40, panelMinWidth),
        Math.min(panelMaxWidth, viewportLimit)
      );
      homePanelWidth.value = nextWidth;
    };

    onMouseUp = () => {
      isResizingHomePanel.value = false;
    };

    document.body.classList.add("is-resizing-home-panel");
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  } else {
    document.body.classList.remove("is-resizing-home-panel");
    if (onMouseMove) window.removeEventListener("mousemove", onMouseMove);
    if (onMouseUp) window.removeEventListener("mouseup", onMouseUp);
    onMouseMove = null;
    onMouseUp = null;
  }
});

onUnmounted(() => {
  document.body.classList.remove("is-resizing-home-panel");
  if (onMouseMove) window.removeEventListener("mousemove", onMouseMove);
  if (onMouseUp) window.removeEventListener("mouseup", onMouseUp);
});

// ---- login handler ----
const handleLogin = (values) => {
  role.value = values.role;
  organizationName.value = values.organizationName ?? "公众访问";
  isAuthenticated.value = true;
  router.push("/map");
};

// ---- provide shared state to child components ----
provide("appState", {
  isEnglish,
  role,
  organizationName,
  textSize,
  language,
  trees,
  filteredTrees,
  speciesFilter,
  dbhRange,
  healthFilter,
  speciesColors,
  stats,
  treeSearchOptions,
  workOrders,
  selectedOrder,
  selectedTree,
  recentWorkOrders,
  topSpecies,
  homePanelWidth,
  isResizingHomePanel,
  roleOptions,
  navOptions,
  initialMaxDbh,
  panelMinWidth,
  panelDefaultWidth,
  panelMaxWidth,
  updateTree,
  createWorkOrder,
  focusTree,
  resetMapFilters,
  updateWorkOrder,
  navigateTo,
  setSelectedTree: (tree) => { selectedTree.value = tree; },
  setSelectedOrder: (order) => { selectedOrder.value = order; },
  setSpeciesFilter: (val) => { speciesFilter.value = val; },
  setDbhRange: (val) => { dbhRange.value = val; },
  setHealthFilter: (val) => { healthFilter.value = val; },
  setTextSize: (val) => { textSize.value = val; },
  setLanguage: (val) => { language.value = val; },
  setRole: (val) => { role.value = val; },
  setOrganizationName: (val) => { organizationName.value = val; },
  setHomePanelWidth: (val) => { homePanelWidth.value = val; },
  setIsResizingHomePanel: (val) => { isResizingHomePanel.value = val; },
  setIsAuthenticated: (val) => { isAuthenticated.value = val; },
});
</script>

<template>
  <!-- Login Page (when not authenticated) -->
  <LoginPage
    v-if="!isAuthenticated"
    :initial-role="role"
    @enter="handleLogin"
  />

  <!-- Main App Shell (when authenticated) -->
  <a-layout v-else class="app-shell" :class="{ 'text-large': textSize === 'large' }">
    <!-- City Top Bar -->
    <div class="city-topbar">
      <div class="city-topbar-inner">
        <span>XI'AN URBAN TREE MAP</span>
        <div class="city-actions">
          <button type="button">{{ isEnglish ? 'Register' : '注册' }}</button>
          <button type="button">{{ isEnglish ? 'Log In' : '登录' }}</button>
        </div>
      </div>
    </div>

    <!-- Site Header -->
    <header class="site-header">
      <div class="site-brand-row">
        <div class="brand">
          <div class="brand-mark">
            <Trees :size="34" />
          </div>
          <div>
            <div class="brand-title">
              {{ isEnglish ? "Xi'an Urban Tree Information Service Platform" : "西安城市树木信息服务平台" }}
            </div>
            <div class="brand-subtitle">
              {{ isEnglish ? "Explore and Care For Xi'an Urban Trees" : "城市树木档案、导览与养护协同平台" }}
            </div>
          </div>
        </div>
        <div class="header-tools">
          <a-button
            type="text"
            :aria-pressed="textSize === 'large'"
            @click="textSize = textSize === 'large' ? 'default' : 'large'"
          >
            <Type :size="16" />
            {{ isEnglish ? `Text Size: ${textSize === 'large' ? 'Large' : 'Normal'}` : `字号：${textSize === 'large' ? '大' : '标准'}` }}
          </a-button>
          <a-button
            type="text"
            :aria-pressed="language === 'en'"
            @click="language = language === 'zh' ? 'en' : 'zh'"
          >
            <Languages :size="16" />
            {{ isEnglish ? 'Language: EN' : '语言：中文' }}
          </a-button>
        </div>
      </div>

      <div class="site-nav-row">
        <a-segmented
          class="main-nav"
          :value="page"
          :options="navOptions"
          @change="navigateTo"
        />
        <div class="role-switcher">
          <span class="role-label">{{ isEnglish ? 'Role' : '当前身份' }}</span>
          <a-segmented
            :value="role"
            :options="roleOptions"
            @change="(val) => { role = val; organizationName = val === 'visitor' ? '公众访问' : organizationName === '公众访问' ? '大兴善寺管理处' : organizationName; }"
          />
          <a-button
            class="logout-button"
            @click="isAuthenticated = false"
          >
            <LogOut :size="15" />
            {{ isEnglish ? 'Exit' : '退出' }}
          </a-button>
        </div>
      </div>
    </header>

    <!-- Page Content -->
    <a-layout-content :class="page === 'map' ? 'map-content' : 'page-content'">
      <router-view />
    </a-layout-content>

    <!-- Tree Detail Drawer (global) -->
    <TreeDetailDrawer
      :tree="selectedTree"
      :role="role"
      :open="Boolean(selectedTree)"
      @close="selectedTree = null"
      @create-work-order="createWorkOrder"
      @update-tree="updateTree"
    />
  </a-layout>
</template>
