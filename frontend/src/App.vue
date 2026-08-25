<script setup>
import { ref, computed, watch, provide, onMounted, onUnmounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import {
  Trees, MapPinned, BarChart3, ClipboardList, Compass, Route as RouteIcon,
  Type, LogOut
} from "lucide-vue-next";
import LoginPage from "./components/LoginPage.vue";
import TreeDetailDrawer from "./components/TreeDetailDrawer.vue";
import {
  buildStats,
  computeNextTreeCode,
  createInitialVisitorLeads,
  createInitialWorkOrders,
  getSpeciesColorMap,
  mockCheckInRecords,
  roleLabels,
  trees as initialTrees,
} from "./api/mockApi";
import { logout } from "./api/authApi";
import { isMockMode } from "./api/http";
import {
  createTree,
  fetchTrees,
  updateTree as updateTreeRequest,
} from "./api/treesApi";
import {
  createWorkOrder as createWorkOrderRequest,
  fetchWorkOrders,
  processWorkOrder,
  reviewWorkOrder,
} from "./api/workOrdersApi";
import {
  convertVisitorLead,
  createVisitorLead as createVisitorLeadRequest,
  deleteVisitorLead as deleteVisitorLeadRequest,
  fetchVisitorLeads,
  updateVisitorLead,
} from "./api/visitorLeadsApi";
import {
  createCheckIn,
  fetchCheckIns,
  toggleCheckInLike,
} from "./api/checkInsApi";
import { fetchStatsOverview } from "./api/statsApi";

const WORK_ORDERS_STORAGE_KEY = "xian-tree-work-orders";

function readStoredWorkOrders() {
  try {
    const raw = localStorage.getItem(WORK_ORDERS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ---- router ----
const router = useRouter();
const route = useRoute();

// ---- state (was useState) ----
const isAuthenticated = ref(false);
const role = ref("admin");
const organizationName = ref("大兴善寺");
const currentUser = ref(null);
const page = ref("map");
const trees = ref([...initialTrees]);
const speciesFilter = ref([]);
const initialMaxDbh = Math.ceil(Math.max(...initialTrees.map((tree) => tree.dbh), 100));
const dbhRange = ref([0, initialMaxDbh]);
const healthFilter = ref("all");
const selectedTree = ref(null);
const workOrders = ref(readStoredWorkOrders() ?? createInitialWorkOrders(initialTrees));
const visitorLeads = ref(createInitialVisitorLeads(initialTrees));
const selectedOrder = ref(null);
const checkInRecords = ref([...mockCheckInRecords]);
const currentUserName = ref("游客");
const textSize = ref("default");
const homePanelWidth = ref(496);
const isResizingHomePanel = ref(false);

// ---- constants ----
const panelMinWidth = 360;
const panelDefaultWidth = 496;
const panelMaxWidth = 680;

// ---- computed (was useMemo) ----
const roleOptions = computed(() => [
  { label: "游客", value: "visitor" },
  { label: "巡检人员", value: "inspector" },
  { label: "养护人员", value: "maintenance" },
]);

const speciesColors = computed(() => getSpeciesColorMap(trees.value));

const navOptions = computed(() => {
  const ecoOption = {
    label: "生态价值",
    value: "eco",
  };
  if (role.value === "admin") {
    return [
      { label: "树木地图", value: "map" },
      ecoOption,
      { label: "工单", value: "workbench" },
      { label: "审核", value: "review" },
    ];
  }
  return [
    { label: "地图", value: "map" },
    ...(role.value === "visitor" ? [] : [ecoOption]),
    { label: "工单", value: "workbench", disabled: role.value === "visitor" },
    { label: "导览", value: "guide" },
  ];
});

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

const stats = ref(buildStats(trees.value));

const treeSearchOptions = computed(() =>
  trees.value.map((tree) => ({
    value: tree.id,
    label: `${tree.code} / ${tree.species} / ${tree.dbh || "未记录"}cm`,
  }))
);

const recentWorkOrders = computed(() => workOrders.value.slice(0, 3));
const topSpecies = computed(() => stats.value.speciesRatio[0]);
const isMobileRoute = computed(() => route.path.startsWith("/mobile"));

function persistWorkOrders() {
  try {
    localStorage.setItem(WORK_ORDERS_STORAGE_KEY, JSON.stringify(workOrders.value));
  } catch {
    // 本地持久化失败时忽略，页面内状态仍正常可用。
  }
}

async function loadAppData() {
  if (isMockMode()) return;
  const currentRole = role.value;
  const tasks = [
    fetchTrees()
      .then((list) => {
        trees.value = list;
      })
      .catch(() => {
        // 保留现有 mock 树作为离线兜底。
      }),
    fetchCheckIns()
      .then((data) => {
        checkInRecords.value = data.list;
      })
      .catch(() => {
        // 保留 mock 打卡数据。
      }),
    fetchStatsOverview({}, trees.value)
      .then((data) => {
        stats.value = data;
      })
      .catch(() => {
        stats.value = buildStats(trees.value);
      }),
  ];

  if (currentRole === "inspector" || currentRole === "maintenance") {
    tasks.push(
      fetchWorkOrders({ page: 1, pageSize: 50, full: true })
        .then((data) => {
          workOrders.value = data.list;
        })
        .catch(() => {
          // 后端不可用时保留 mock 工单。
        }),
      fetchVisitorLeads({ page: 1, pageSize: 50 })
        .then((data) => {
          visitorLeads.value = data.list;
        })
        .catch(() => {
          // 后端不可用时保留 mock 线索。
        })
    );
  }

  await Promise.allSettled(tasks);
}

function resetToLogin() {
  currentUser.value = null;
  currentUserName.value = "游客";
  isAuthenticated.value = false;
  role.value = "admin";
  organizationName.value = "大兴善寺";
  selectedTree.value = null;
  selectedOrder.value = null;
  router.push("/map");
}

// ---- sync route with page state ----
watch(() => route.path, (path) => {
  const pageName = path.replace("/", "") || "map";
  if (["map", "eco", "workbench", "guide", "review"].includes(pageName)) {
    page.value = pageName;
  }
});

watch([isMobileRoute, role, isAuthenticated], ([mobileRoute, currentRole, authenticated]) => {
  if (!authenticated) return;
  if (mobileRoute && currentRole === "admin") {
    router.replace("/map");
  } else if (!mobileRoute && currentRole !== "admin") {
    router.replace("/mobile/map");
  }
});

// ---- actions ----
const updateTree = async (nextTree) => {
  if (!isMockMode()) {
    try {
      const rawPhotos =
        Array.isArray(nextTree.photoList) && nextTree.photoList.length
          ? nextTree.photoList
          : Array.isArray(nextTree.photos)
            ? nextTree.photos
            : undefined;
      const photos = Array.isArray(rawPhotos)
        ? rawPhotos.map((photo) =>
            typeof photo === "string"
              ? { uid: `photo-${photo.slice(-16)}`, name: "树木照片", url: photo }
              : photo
          )
        : undefined;
      const updated = await updateTreeRequest(nextTree.code, {
        species: nextTree.species,
        dbh: nextTree.dbh,
        story: nextTree.story,
        healthStatus: nextTree.healthStatus,
        ...(photos ? { photos } : {}),
      });
      trees.value = trees.value.map((tree) => (tree.id === updated.id ? updated : tree));
      selectedTree.value = updated;
      return;
    } catch (error) {
      console.warn("[api] 更新树木档案失败：", error?.message || error);
    }
  }
  trees.value = trees.value.map((tree) => (tree.id === nextTree.id ? nextTree : tree));
  selectedTree.value = nextTree;
};

const addTree = async (treeData) => {
  if (!isMockMode()) {
    try {
      const siteId = treeData.siteId || currentUser.value?.organizationId;
      const created = await createTree({ ...treeData, siteId }, trees.value);
      trees.value = [...trees.value, created];
      selectedTree.value = created;
      return;
    } catch (error) {
      console.warn("[api] 新增树木失败：", error?.message || error);
    }
  }
  const customCode = String(treeData.code || treeData.id || "").trim();
  const nextCode = customCode || computeNextTreeCode(trees.value);
  const newTree = {
    id: nextCode,
    code: nextCode,
    species: treeData.species,
    dbh: Number(treeData.dbh) || 0,
    longitude: Number(treeData.longitude) || 0,
    latitude: Number(treeData.latitude) || 0,
    siteId: treeData.siteId || "daxingshansi",
    siteName: treeData.siteName || "大兴善寺",
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

const createWorkOrder = async (order, { navigate = true } = {}) => {
  if (!isMockMode() && !order.__alreadyCreated) {
    try {
      const created = await createWorkOrderRequest(order);
      workOrders.value = [created, ...workOrders.value];
      persistWorkOrders();
      if (navigate && role.value !== "visitor") {
        router.push("/workbench");
      }
      return;
    } catch (error) {
      console.warn("[api] 创建工单失败：", error?.message || error);
    }
  }
  workOrders.value = [order, ...workOrders.value];
  persistWorkOrders();
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

const createVisitorLead = async (lead) => {
  visitorLeads.value = [lead, ...visitorLeads.value];
  if (!isMockMode()) {
    try {
      const created = await createVisitorLeadRequest(lead);
      visitorLeads.value = visitorLeads.value.map((item) =>
        item.id === lead.id ? created : item
      );
    } catch (error) {
      console.warn("[api] 提交游客线索失败：", error?.message || error);
    }
  }
};

const deleteVisitorLead = async (leadId) => {
  visitorLeads.value = visitorLeads.value.filter((lead) => lead.id !== leadId);
  if (!isMockMode()) {
    try {
      await deleteVisitorLeadRequest(leadId);
    } catch (error) {
      console.warn("[api] 删除游客线索失败：", error?.message || error);
    }
  }
};

const addCheckIn = async ({ treeId, treeCode, species, photoUrl }) => {
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
  if (!isMockMode()) {
    try {
      const created = await createCheckIn({
        treeId,
        treeCode,
        species,
        photoUrl,
        userName: currentUserName.value,
      });
      checkInRecords.value = checkInRecords.value.map((item) =>
        item.id === record.id ? created : item
      );
    } catch (error) {
      console.warn("[api] 新增打卡失败：", error?.message || error);
    }
  }
};

const toggleLike = async (checkInId) => {
  const currentRecord = checkInRecords.value.find((r) => r.id === checkInId);
  if (!currentRecord) return;

  const userKey = currentUser.value?.id || currentUserName.value;
  const liked = !(currentRecord.likedBy || []).includes(userKey);
  const nextLikedBy = liked
    ? [...currentRecord.likedBy, userKey]
    : currentRecord.likedBy.filter((u) => u !== userKey);
  checkInRecords.value = checkInRecords.value.map((r) =>
    r.id === checkInId ? { ...r, likedBy: nextLikedBy, likeCount: nextLikedBy.length } : r
  );

  if (!isMockMode()) {
    try {
      const result = await toggleCheckInLike(checkInId, liked);
      checkInRecords.value = checkInRecords.value.map((r) =>
        r.id === checkInId
          ? {
              ...r,
              likedBy:
                typeof result.liked === "boolean"
                  ? result.liked
                    ? [...new Set([...r.likedBy, userKey])]
                    : r.likedBy.filter((u) => u !== userKey)
                  : r.likedBy,
              likeCount:
                typeof result.likeCount === "number" ? result.likeCount : r.likeCount,
            }
          : r
      );
    } catch (error) {
      console.warn("[api] 点赞失败：", error?.message || error);
    }
  }
};

const convertVisitorLeadToWorkOrder = async (lead) => {
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
  persistWorkOrders();
  visitorLeads.value = visitorLeads.value.map((item) =>
    item.id === lead.id
      ? { ...item, status: "converted", convertedAt: now, convertedOrderId: order.id }
      : item
  );
  if (!isMockMode()) {
    try {
      await updateVisitorLead(lead.id, {
        issueType: lead.issueType,
        issueDescription: lead.issueDescription,
        locationDescription: lead.locationDescription,
        healthStatus: lead.healthStatus || "healthy",
      });
      const converted = await convertVisitorLead(lead.id);
      if (converted) {
        const merged = { ...order, ...converted };
        workOrders.value = workOrders.value
          .filter((item) => item.id !== order.id)
          .concat([merged]);
        visitorLeads.value = visitorLeads.value.map((item) =>
          item.id === lead.id
            ? { ...item, convertedOrderId: converted.id }
            : item
        );
      }
    } catch (error) {
      console.warn("[api] 游客线索转工单失败：", error?.message || error);
    }
  }
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

const updateWorkOrder = async (nextOrder) => {
  if (!isMockMode()) {
    const previous = workOrders.value.find((order) => order.id === nextOrder.id);
    try {
      let updated = nextOrder;
      if (previous?.status === "processing" && nextOrder.status === "reviewing") {
        updated = await processWorkOrder(previous.id, {
          treatmentMeasures: nextOrder.treatmentMeasures,
          treatmentPhotos: nextOrder.treatmentPhotos,
        });
      } else if (
        previous?.status === "reviewing" &&
        ["archived", "processing"].includes(nextOrder.status)
      ) {
        updated = await reviewWorkOrder(previous.id, {
          passed: nextOrder.status === "archived",
          reviewComment: nextOrder.reviewComment,
          reviewHealthStatus: nextOrder.reviewHealthStatus,
        });
      }
      workOrders.value = workOrders.value.map((order) =>
        order.id === nextOrder.id ? updated : order
      );
      persistWorkOrders();
      selectedOrder.value = updated;
      return;
    } catch (error) {
      console.warn("[api] 更新工单失败：", error?.message || error);
    }
  }
  workOrders.value = workOrders.value.map((order) => (order.id === nextOrder.id ? nextOrder : order));
  persistWorkOrders();
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
  if (newRole === "admin" && newPage === "guide") {
    router.push("/map");
  }
  if (newRole !== "admin" && newPage === "review") {
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
  window.removeEventListener("xian:unauthorized", resetToLogin);
});

onMounted(() => {
  window.addEventListener("xian:unauthorized", resetToLogin);
});

// ---- login handler ----
const handleLogin = async (user) => {
  currentUser.value = user;
  role.value = user.role;
  organizationName.value = user.organizationName ?? "公众访问";
  currentUserName.value = user.username ?? user.account ?? roleLabels[user.role] ?? "游客";
  isAuthenticated.value = true;
  router.push(isMobileRoute.value ? "/mobile/map" : "/map");
  await loadAppData();
};

const handleLogout = async () => {
  const shouldStayMobile = isMobileRoute.value;
  await logout();
  currentUser.value = null;
  currentUserName.value = "游客";
  isAuthenticated.value = false;
  role.value = shouldStayMobile ? "inspector" : "admin";
  organizationName.value = "大兴善寺";
  selectedTree.value = null;
  selectedOrder.value = null;
  router.push(shouldStayMobile ? "/mobile/map" : "/map");
};

// ---- provide shared state to child components ----
provide("appState", {
  role,
  organizationName,
  currentUser,
  textSize,
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
  handleLogout,
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
    :mobile="isMobileRoute"
    @enter="handleLogin"
  />

  <router-view v-else-if="isMobileRoute" />

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
              西安城市树木信息服务平台
            </div>
            <div class="brand-subtitle">
              城市树木档案、导览与养护协同平台
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
            字号：{{ textSize === 'large' ? '大' : '标准' }}
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
          <span class="role-label">{{ role === 'admin' ? '管理后台' : '当前身份' }}</span>
          <a-segmented
            v-if="role !== 'admin'"
            :value="role"
            :options="roleOptions"
            @change="(val) => { role = val; organizationName = val === 'visitor' ? '公众访问' : organizationName === '公众访问' ? '大兴善寺' : organizationName; }"
          />
          <a-button
            class="logout-button"
            @click="handleLogout"
          >
            <LogOut :size="15" />
            退出
          </a-button>
        </div>
      </div>
    </header>

    <!-- Page Content -->
    <a-layout-content :class="['map', 'eco'].includes(page) ? 'map-content' : 'page-content'">
      <router-view />
    </a-layout-content>

    <!-- Tree Detail Drawer (global, suppressed on guide page for non-visitors) -->
    <TreeDetailDrawer
      :tree="selectedTree"
      :role="role"
      :open="Boolean(selectedTree) && !(page === 'guide' && role !== 'visitor') && page !== 'eco'"
      @close="selectedTree = null"
      @create-visitor-lead="createVisitorLead"
      @update-tree="updateTree"
    />
  </a-layout>
</template>
