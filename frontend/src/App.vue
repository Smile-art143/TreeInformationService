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
  computeNextTreeCode,
  createInitialVisitorLeads,
  createInitialWorkOrders,
  getSpeciesColorMap,
  roleLabels,
  trees as initialTrees,
} from "./api/mockApi";
import { logout } from "./api/authApi";

// ---- router ----
const router = useRouter();
const route = useRoute();

// ---- state (was useState) ----
const isAuthenticated = ref(false);
const role = ref("inspector");
const organizationName = ref("大兴善寺");
const currentUser = ref(null);
const page = ref("map");
const trees = ref([...initialTrees]);
const speciesFilter = ref([]);
const initialMaxDbh = Math.ceil(Math.max(...initialTrees.map((tree) => tree.dbh), 100));
const dbhRange = ref([0, initialMaxDbh]);
const healthFilter = ref("all");
const selectedTree = ref(null);
const workOrders = ref(createInitialWorkOrders(initialTrees));
const visitorLeads = ref(createInitialVisitorLeads(initialTrees));
const selectedOrder = ref(null);
const checkInRecords = ref([
  {
    id: "ci-demo-1",
    treeId: "DX-1",
    treeCode: "DX-1",
    species: "松树",
    photoUrl: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=400&q=80",
    userName: "游客",
    likedBy: ["游客", "巡检员小王"],
    createdAt: "2026/8/5 14:30:00",
  },
  {
    id: "ci-demo-2",
    treeId: "DX-2",
    treeCode: "DX-2",
    species: "侧柏",
    photoUrl: "https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&w=400&q=80",
    userName: "游客",
    likedBy: ["游客"],
    createdAt: "2026/8/4 09:15:00",
  },
  {
    id: "ci-demo-3",
    treeId: "DX-1",
    treeCode: "DX-1",
    species: "松树",
    photoUrl: "https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=400&q=80",
    userName: "巡检员小王",
    likedBy: ["游客", "养护老李", "巡检员小王"],
    createdAt: "2026/8/3 16:45:00",
  },
  {
    id: "ci-demo-4",
    treeId: "DX-2",
    treeCode: "DX-2",
    species: "侧柏",
    photoUrl: "https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?auto=format&fit=crop&w=400&q=80",
    userName: "养护老李",
    likedBy: [],
    createdAt: "2026/8/2 11:00:00",
  },
  {
    id: "ci-demo-5",
    treeId: "DX-1",
    treeCode: "DX-1",
    species: "松树",
    photoUrl: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=400&q=80",
    userName: "游客",
    likedBy: ["养护老李"],
    createdAt: "2026/8/1 08:20:00",
  },
]);
const currentUserName = ref("游客");
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
  { label: isEnglish.value ? "Inspector" : "巡检人员", value: "inspector" },
  { label: isEnglish.value ? "Maintenance" : "养护人员", value: "maintenance" },
]);

const speciesColors = computed(() => getSpeciesColorMap(trees.value));

const navOptions = computed(() => [
  { label: isEnglish.value ? "Map" : "地图", value: "map" },

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

const unlockedSpecies = computed(() => [...new Set(checkInRecords.value.map((r) => r.species))]);
const allSpecies = computed(() => [...new Set(trees.value.map((t) => t.species))].sort((a, b) => a.localeCompare(b, "zh-Hans-CN")));
const checkInLeaderboard = computed(() => {
  const counts = {};
  checkInRecords.value.forEach((r) => {
    const key = r.treeId;
    if (!counts[key]) {
      counts[key] = { treeId: r.treeId, treeCode: r.treeCode, species: r.species, count: 0 };
    }
    counts[key].count += 1;
  });
  return Object.values(counts).sort((a, b) => b.count - a.count);
});
const photoWallPhotos = computed(() => checkInRecords.value.filter((r) => r.photoUrl));

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
  if (["map", "workbench", "guide", "routes"].includes(pageName)) {
    page.value = pageName;
  }
});

// ---- actions ----
const updateTree = (nextTree) => {
  trees.value = trees.value.map((tree) => (tree.id === nextTree.id ? nextTree : tree));
  selectedTree.value = nextTree;
};

const addTree = (treeData) => {
  const nextCode = computeNextTreeCode(trees.value);
  const newTree = {
    id: nextCode,
    code: nextCode,
    species: treeData.species,
    dbh: Number(treeData.dbh) || 0,
    longitude: Number(treeData.longitude) || 0,
    latitude: Number(treeData.latitude) || 0,
    siteId: "site",
    siteName: treeData.locationDescription || "",
    treeType: treeData.treeType,
    isAncient: treeData.treeType === "古树",
    protectionLevel: treeData.treeType === "古树" ? treeData.protectionLevel : null,
    healthStatus: treeData.healthStatus || "healthy",
    locationDescription: treeData.locationDescription || "",
    photos: treeData.photos || [],
    story: treeData.story || "",
    remark: "",
  };
  trees.value = [...trees.value, newTree];
  selectedTree.value = newTree;
};

const createWorkOrder = (order, { navigate = true } = {}) => {
  workOrders.value = [order, ...workOrders.value];
  if (navigate && role.value !== "visitor") {
    router.push("/workbench");
  }
};

const pendingOrdersForRole = computed(() => {
  const status = role.value === "maintenance" ? "processing" : "reviewing";
  return workOrders.value.filter((o) => o.status === status);
});

const navigateToGuideWithOrder = (orderId) => {
  router.push(`/guide?pageMode=navigate&orderId=${orderId}`);
};

const createVisitorLead = (lead) => {
  visitorLeads.value = [lead, ...visitorLeads.value];
};

const deleteVisitorLead = (leadId) => {
  visitorLeads.value = visitorLeads.value.filter((lead) => lead.id !== leadId);
};

const addCheckIn = ({ treeId, treeCode, species, photoUrl }) => {
  const record = {
    id: `ci-${Date.now()}`,
    treeId,
    treeCode,
    species,
    photoUrl,
    userName: currentUserName.value,
    likedBy: [],
    createdAt: new Date().toLocaleString("zh-CN", { hour12: false }),
  };
  checkInRecords.value = [record, ...checkInRecords.value];
};

const toggleLike = (checkInId) => {
  checkInRecords.value = checkInRecords.value.map((r) => {
    if (r.id !== checkInId) return r;
    const idx = r.likedBy.indexOf(currentUserName.value);
    if (idx >= 0) {
      return { ...r, likedBy: r.likedBy.filter((u) => u !== currentUserName.value) };
    }
    return { ...r, likedBy: [...r.likedBy, currentUserName.value] };
  });
};

const convertVisitorLeadToWorkOrder = (lead) => {
  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  const order = {
    id: `wo-${Date.now()}`,
    orderNo: `WO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`,
    treeId: lead.treeId,
    status: "processing",
    issueType: lead.issueType,
    issueDescription: [lead.issueDescription, lead.locationDescription ? `相对位置：${lead.locationDescription}` : ""]
      .filter(Boolean)
      .join("；"),
    creatorId: currentUser.value?.id,
    creatorRole: role.value,
    creatorName: currentUserName.value,
    createPhotos: lead.photos,
    treatmentPhotos: [],
    createdAt: now,
    updatedAt: now,
    sourceLeadId: lead.id,
  };

  // Update tree health status if lead has one
  if (lead.healthStatus) {
    const tree = trees.value.find((t) => t.id === lead.treeId);
    if (tree && tree.healthStatus !== lead.healthStatus) {
      trees.value = trees.value.map((t) =>
        t.id === tree.id ? { ...t, healthStatus: lead.healthStatus } : t
      );
    }
  }

  workOrders.value = [order, ...workOrders.value];
  visitorLeads.value = visitorLeads.value.map((item) =>
    item.id === lead.id
      ? { ...item, status: "converted", convertedAt: now, convertedOrderId: order.id }
      : item
  );
  selectedOrder.value = order;
  return order;
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
const handleLogin = (user) => {
  currentUser.value = user;
  role.value = user.role;
  organizationName.value = user.organizationName ?? "公众访问";
  currentUserName.value = user.username ?? user.account ?? roleLabels[user.role] ?? "游客";
  isAuthenticated.value = true;
  router.push("/map");
};

const handleLogout = async () => {
  await logout();
  currentUser.value = null;
  currentUserName.value = "游客";
  isAuthenticated.value = false;
  role.value = "inspector";
  organizationName.value = "大兴善寺";
  selectedTree.value = null;
  selectedOrder.value = null;
  router.push("/map");
};

// ---- provide shared state to child components ----
provide("appState", {
  isEnglish,
  role,
  organizationName,
  currentUser,
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
  visitorLeads,
  checkInRecords,
  currentUserName,
  unlockedSpecies,
  allSpecies,
  checkInLeaderboard,
  photoWallPhotos,
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
  addTree,
  addCheckIn,
  toggleLike,
  createWorkOrder,
  createVisitorLead,
  deleteVisitorLead,
  convertVisitorLeadToWorkOrder,
  focusTree,
  resetMapFilters,
  updateWorkOrder,
  navigateTo,
  pendingOrdersForRole,
  navigateToGuideWithOrder,
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
          <span>{{ currentUser?.account }}</span>
          <span>{{ roleLabels[role] }}</span>
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
            @change="(val) => { role = val; organizationName = val === 'visitor' ? '公众访问' : organizationName === '公众访问' ? '大兴善寺' : organizationName; }"
          />
          <a-button
            class="logout-button"
            @click="handleLogout"
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

    <!-- Tree Detail Drawer (global, suppressed on guide page for non-visitors) -->
    <TreeDetailDrawer
      :tree="selectedTree"
      :role="role"
      :open="Boolean(selectedTree) && !(page === 'guide' && role !== 'visitor')"
      @close="selectedTree = null"
      @create-visitor-lead="createVisitorLead"
      @update-tree="updateTree"
    />
  </a-layout>
</template>
