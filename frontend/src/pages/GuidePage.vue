<script setup>
import { computed, inject, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { Camera, CheckCircle2, Heart, MapPin, Medal, Navigation, Search, Trophy, Wrench, X } from "lucide-vue-next";
import { message } from "ant-design-vue";
import ArcGISTreeMap from "../components/ArcGISTreeMap.vue";
import GuideSection from "../components/GuideSection.vue";
import CreateWorkOrderModal from "../components/CreateWorkOrderModal.vue";
import {
  fetchNearbyTreesMock, haversineDistance, calculateBearing, bearingToText,
  getPendingOrdersForRole, healthLabels, healthOptions, issueTypes,
  roleLabels, statusLabels,
} from "../api/mockApi";

const app = inject("appState");
const {
  trees, speciesColors, selectedTree, role, currentUser, currentUserName,
  setSelectedTree, focusTree,
  unlockedSpecies, allSpecies,
  checkInLeaderboard, photoWallPhotos,
  addCheckIn, toggleLike,
  createWorkOrder, updateTree, updateWorkOrder,
  workOrders, navigateToGuideWithOrder,
} = app;

// ---- inspector mode ----
const inspectorMode = computed(() => role.value === "inspector" || role.value === "maintenance");
const mapRef = ref(null);

// Virtual current position (center of Daxingshan Temple trees)
const virtualPosition = reactive({ lat: 34.2265, lng: 108.9445 });
const searchRadius = ref(10);
const nearbyTreeResults = ref([]);
const isSearching = ref(false);
const inspectorSelectedTree = ref(null);
const showCreateOrderModal = ref(false);
let searchDebounce = null;

// ---- navigate mode ----
const route = useRoute();
const pageMode = ref("select"); // 'select' | 'navigate'
const navSubMode = ref("batch"); // 'batch' | 'guiding'
const targetOrder = ref(null);
const targetTree = ref(null);
const pendingOrders = ref([]);
const pendingTrees = ref([]);
const highlightedOrderId = ref(null);
const guidingDistance = ref(0);
const guidingBearing = ref("");
const showOrderDetailDrawer = ref(false);
const detailOrder = ref(null);
const navRoleLabel = computed(() => role.value === "maintenance" ? "待处置" : "待复核");
const statusColor = { created: "default", processing: "blue", reviewing: "purple", archived: "green" };
let distanceMonitor = null;

// Order detail drawer form state
const guideTreatmentForm = ref({ treatmentMeasures: "" });
const guideTreatmentPhotos = ref([]);
const guideReviewForm = ref({ reviewComment: "", healthStatus: "warning" });

function updateMapOverlays() {
  const map = mapRef.value;
  if (!map) return;
  map.clearCustomOverlays();
  map.showLocationMarker(virtualPosition.lat, virtualPosition.lng);
  map.showRadiusCircle(virtualPosition.lat, virtualPosition.lng, searchRadius.value);
  if (nearbyTreeResults.value.length > 0) {
    map.showNearbyHighlight(nearbyTreeResults.value);
  }
}

async function searchNearbyTrees() {
  isSearching.value = true;
  try {
    nearbyTreeResults.value = await fetchNearbyTreesMock(
      trees.value, virtualPosition.lat, virtualPosition.lng, searchRadius.value
    );
  } finally {
    isSearching.value = false;
    updateMapOverlays();
  }
}

function onMapClick({ longitude, latitude }) {
  virtualPosition.lng = longitude;
  virtualPosition.lat = latitude;
  searchNearbyTrees();
}

function selectInspectorTree(tree) {
  inspectorSelectedTree.value = tree;
  setSelectedTree(tree);
}

function onCoordChange() {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => searchNearbyTrees(), 600);
}

// ---- arcgis tree select ----
const onTreeSelect = (tree) => {
  setSelectedTree(tree);
  if (inspectorMode.value) {
    if (pageMode.value === "select") {
      inspectorSelectedTree.value = tree;
    } else if (pageMode.value === "navigate" && navSubMode.value === "batch") {
      const order = pendingOrders.value.find((o) => o.treeId === tree.id);
      if (order) selectOrderInList(order);
    }
  }
};

// ---- work order creation from inspector ----
function handleCreateWorkOrder(order) {
  createWorkOrder(order, { navigate: false });
  showCreateOrderModal.value = false;
  message.success("正式工单已创建，状态为待处置");
}

function handleUpdateTree(tree) {
  updateTree(tree);
}

// ============================================================
//  Navigate mode functions
// ============================================================

function loadPendingOrders() {
  pendingOrders.value = getPendingOrdersForRole(workOrders.value, role.value);
  const treeIds = [...new Set(pendingOrders.value.map((o) => o.treeId))];
  pendingTrees.value = treeIds
    .map((id) => trees.value.find((t) => t.id === id))
    .filter(Boolean);
  updateNavigateMapOverlays();
}

function updateNavigateMapOverlays() {
  const map = mapRef.value;
  if (!map) return;
  map.clearCustomOverlays();
  const statusType = role.value === "maintenance" ? "processing" : "reviewing";
  if (pendingTrees.value.length > 0) {
    map.showPendingTreeMarkers(pendingTrees.value, statusType);
  }
  if (navSubMode.value === "guiding" && targetTree.value) {
    map.showLocationMarker(virtualPosition.lat, virtualPosition.lng);
    map.showTargetMarker(
      targetTree.value.latitude, targetTree.value.longitude,
      statusType, targetTree.value.dbh
    );
    map.showNavigationLine(
      virtualPosition.lat, virtualPosition.lng,
      targetTree.value.latitude, targetTree.value.longitude
    );
  }
}

function selectOrderInList(order) {
  highlightedOrderId.value = order.id;
  const tree = trees.value.find((t) => t.id === order.treeId);
  if (tree) {
    setSelectedTree(tree);
    mapRef.value?.flyTo(tree.latitude, tree.longitude, 18);
  }
}

// ---- single-tree navigation ----
function startNavigate(order) {
  const tree = trees.value.find((t) => t.id === order.treeId);
  if (!tree) return;
  targetOrder.value = order;
  targetTree.value = tree;
  highlightedOrderId.value = order.id;
  navSubMode.value = "guiding";
  updateGuidingHUD();
  updateNavigateMapOverlays();
  startDistanceMonitor();
}

function updateGuidingHUD() {
  if (!targetTree.value) return;
  const dist = haversineDistance(
    virtualPosition.lat, virtualPosition.lng,
    targetTree.value.latitude, targetTree.value.longitude
  );
  guidingDistance.value = Math.round(dist * 10) / 10;
  const bearing = calculateBearing(
    virtualPosition.lat, virtualPosition.lng,
    targetTree.value.latitude, targetTree.value.longitude
  );
  guidingBearing.value = bearingToText(bearing);
}

function startDistanceMonitor() {
  clearInterval(distanceMonitor);
  distanceMonitor = setInterval(() => {
    updateGuidingHUD();
    if (guidingDistance.value < 10) {
      exitGuiding();
    }
  }, 1000);
}

function exitGuiding() {
  clearInterval(distanceMonitor);
  navSubMode.value = "batch";
  targetOrder.value = null;
  targetTree.value = null;
  updateNavigateMapOverlays();
  message.success("已到达目标树木附近（<10米），请进行现场核验");
}

function cancelNavigate() {
  clearInterval(distanceMonitor);
  navSubMode.value = "batch";
  targetOrder.value = null;
  targetTree.value = null;
  updateNavigateMapOverlays();
  message.info("已退出导航");
}

// ---- work order detail drawer ----
function openOrderDetail(order) {
  detailOrder.value = order;
  guideTreatmentForm.value = { treatmentMeasures: "" };
  guideTreatmentPhotos.value = [];
  const tree = trees.value.find((t) => t.id === order.treeId);
  guideReviewForm.value = { reviewComment: "", healthStatus: tree?.healthStatus ?? "warning" };
  showOrderDetailDrawer.value = true;
}

function closeOrderDetail() {
  showOrderDetailDrawer.value = false;
  detailOrder.value = null;
}

function toPhotoRecords(fileList) {
  return (fileList || []).map((f) => ({ uid: f.uid, name: f.name, url: f.url ?? f.thumbUrl }));
}

function submitTreatmentInGuide() {
  if (!guideTreatmentForm.value.treatmentMeasures.trim()) {
    message.error("请填写处置措施");
    return;
  }
  if (guideTreatmentPhotos.value.length === 0) {
    message.error("提交处置必须上传照片");
    return;
  }
  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  const updated = {
    ...detailOrder.value,
    status: "reviewing",
    handlerId: currentUser.value?.id,
    handlerName: currentUserName.value,
    treatmentMeasures: guideTreatmentForm.value.treatmentMeasures,
    treatmentPhotos: toPhotoRecords(guideTreatmentPhotos.value),
    processedAt: now,
    updatedAt: now,
  };
  handleOrderUpdate(updated);
}

function submitReviewInGuide(passed) {
  if (!guideReviewForm.value.healthStatus) {
    message.error("请选择复核后健康状态");
    return;
  }
  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  const updated = {
    ...detailOrder.value,
    status: passed ? "archived" : "processing",
    reviewResult: passed ? "passed" : "rework",
    reviewComment: guideReviewForm.value.reviewComment || (passed ? "处置效果达标，归档。" : "处置效果不足，退回待处置。"),
    reviewHealthStatus: guideReviewForm.value.healthStatus,
    reviewerId: currentUser.value?.id,
    reviewerName: currentUserName.value,
    reviewedAt: now,
    archivedAt: passed ? now : detailOrder.value.archivedAt,
    updatedAt: now,
  };
  const tree = trees.value.find((t) => t.id === detailOrder.value.treeId);
  if (tree && tree.healthStatus !== guideReviewForm.value.healthStatus) {
    updateTree({ ...tree, healthStatus: guideReviewForm.value.healthStatus });
  }
  handleOrderUpdate(updated);
}

function handleOrderUpdate(updatedOrder) {
  updateWorkOrder(updatedOrder);
  loadPendingOrders();
  closeOrderDetail();
  message.success(updatedOrder.status === "archived" ? "工单已复核归档" : "工单状态已更新");
}

// ---- page mode switching ----
function switchToSelectMode() {
  pageMode.value = "select";
  if (navSubMode.value === "guiding") cancelNavigate();
  searchNearbyTrees();
}

function switchToNavigateMode() {
  pageMode.value = "navigate";
  if (navSubMode.value === "guiding") cancelNavigate();
  loadPendingOrders();
}

// ---- auto-search on page load for inspector ----
onMounted(() => {
  if (!inspectorMode.value) return;
  const modeParam = route.query.pageMode;
  if (modeParam === "navigate") {
    pageMode.value = "navigate";
    loadPendingOrders();
  } else {
    pageMode.value = "select";
    searchNearbyTrees();
  }
  // Highlight specific order if passed via query
  const orderId = route.query.orderId;
  if (orderId) {
    highlightedOrderId.value = orderId;
    const order = workOrders.value.find((o) => o.id === orderId);
    if (order) {
      const tree = trees.value.find((t) => t.id === order.treeId);
      if (tree) {
        setTimeout(() => {
          mapRef.value?.flyTo(tree.latitude, tree.longitude, 18);
          setSelectedTree(tree);
        }, 300);
      }
    }
  }
});

// ---- clear selectedTree when leaving guide page (inspector only) ----
onUnmounted(() => {
  if (inspectorMode.value) {
    setSelectedTree(null);
    inspectorSelectedTree.value = null;
    clearInterval(distanceMonitor);
  }
});

// ---- re-search when radius changes ----
watch(searchRadius, () => {
  if (inspectorMode.value) searchNearbyTrees();
});

// ---- visitor: tree detail drawer ----
const viewingTree = ref(null);
const showTreeDrawer = ref(false);

const openViewTree = (tree) => {
  viewingTree.value = tree;
  showTreeDrawer.value = true;
};

const closeViewTree = () => {
  showTreeDrawer.value = false;
};

// ---- visitor: check-in camera ----
const cameraInput = ref(null);
const triggerCamera = () => {
  cameraInput.value?.click();
};

const onCameraCapture = (event) => {
  const file = event.target.files?.[0];
  if (!file || !viewingTree.value) return;
  const photoUrl = URL.createObjectURL(file);
  addCheckIn({
    treeId: viewingTree.value.id,
    treeCode: viewingTree.value.code,
    species: viewingTree.value.species,
    photoUrl,
  });
  showTreeDrawer.value = false;
  message.success(`打卡成功，解锁 ${viewingTree.value.species} 图鉴`);
  event.target.value = "";
};

// ---- visitor: photo wall ----
const previewPhoto = ref(null);
const openPhotoPreview = (photo) => {
  previewPhoto.value = photo;
};
const closePhotoPreview = () => {
  previewPhoto.value = null;
};

const handleLike = (checkInId) => {
  toggleLike(checkInId);
};

// ---- visitor: leaderboard rank icons ----
const rankMedals = { 1: "#FFD700", 2: "#C0C0C0", 3: "#CD7F32" };
</script>

<template>
  <div class="guide-page">
    <!-- Map Area -->
    <div class="guide-map-area">
      <ArcGISTreeMap
        ref="mapRef"
        :trees="trees"
        :selected-tree="selectedTree"
        :species-colors="speciesColors"
        @tree-select="onTreeSelect"
        @map-click="onMapClick"
      />
    </div>

    <!-- Left Content Panel -->
    <div class="guide-content-wrap">
      <!-- Visitor mode: GuideSection -->
      <GuideSection
        v-if="role === 'visitor'"
        :trees="trees"
        :role="role"
        @focus-tree="focusTree"
        @view-tree="openViewTree"
      />

      <!-- Inspector/Maintenance mode -->
      <template v-if="inspectorMode">
        <!-- Mode Tabs -->
        <div class="mode-tabs">
          <button
            :class="['mode-tab', pageMode === 'select' ? 'active' : '']"
            @click="switchToSelectMode"
          >
            <Search :size="14" /> 选择定位
          </button>
          <button
            :class="['mode-tab', pageMode === 'navigate' ? 'active' : '']"
            @click="switchToNavigateMode"
          >
            <Navigation :size="14" /> 导航前往
          </button>
        </div>

        <!-- ====== SELECT MODE ====== -->
        <template v-if="pageMode === 'select'">
          <a-card class="inspector-main-card" :bordered="false" title="问题树木选择定位">
            <div class="coords-row">
              <a-input
                :value="virtualPosition.lat.toFixed(6)"
                size="small"
                placeholder="纬度"
                style="flex:1"
                @change="(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) { virtualPosition.lat = v; onCoordChange(); } }"
              >
                <template #addonBefore>纬度</template>
              </a-input>
              <a-input
                :value="virtualPosition.lng.toFixed(6)"
                size="small"
                placeholder="经度"
                style="flex:1"
                @change="(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) { virtualPosition.lng = v; onCoordChange(); } }"
              >
                <template #addonBefore>经度</template>
              </a-input>
            </div>
            <p class="coords-hint">
              <MapPin :size="12" /> 点击地图也可定位 · 当前: {{ virtualPosition.lat.toFixed(6) }}, {{ virtualPosition.lng.toFixed(6) }}
            </p>

            <a-form-item label="搜索半径" style="margin-bottom: 8px;">
              <a-select
                v-model:value="searchRadius"
                size="small"
                :options="[
                  { label: '5 米', value: 5 },
                  { label: '10 米', value: 10 },
                  { label: '20 米', value: 20 },
                  { label: '50 米', value: 50 },
                ]"
                style="width: 100%"
              />
            </a-form-item>

            <a-button block @click="searchNearbyTrees" :loading="isSearching">
              <Search :size="14" />搜索周边树木
            </a-button>

            <div style="margin-top: 12px;">
              <div v-if="isSearching" class="empty-hint">
                <a-spin size="small" /> 正在搜索周边树木…
              </div>
              <div v-else-if="nearbyTreeResults.length === 0" class="empty-hint">
                该范围内未找到树木，请调整位置或半径
              </div>
              <a-list v-else :data-source="nearbyTreeResults" size="small">
                <template #renderItem="{ item: tree }">
                  <a-list-item
                    :class="inspectorSelectedTree?.id === tree.id ? 'tree-list-item selected' : 'tree-list-item'"
                    @click="selectInspectorTree(tree)"
                  >
                    <template #actions>
                      <a-tag color="blue">{{ tree.distance }}m</a-tag>
                    </template>
                    <a-list-item-meta
                      :title="`${tree.code} / ${tree.species}`"
                      :description="`DBH ${tree.dbh || '?'}cm · ${tree.healthStatus === 'healthy' ? '正常' : tree.healthStatus === 'problem' ? '异常' : '待观察'}`"
                    >
                      <template #avatar>
                        <span class="mini-tree-dot" :style="{ background: speciesColors[tree.species] || '#4B7F52' }" />
                      </template>
                    </a-list-item-meta>
                  </a-list-item>
                </template>
              </a-list>
            </div>
          </a-card>

          <a-card
            v-if="inspectorSelectedTree"
            class="tree-detail-card"
            :bordered="false"
            title="树木详情核验"
            style="margin-top: 12px;"
          >
            <img
              v-if="inspectorSelectedTree.photos?.[0]"
              :src="inspectorSelectedTree.photos[0]"
              :alt="inspectorSelectedTree.species"
              class="tree-photo"
            />
            <a-descriptions bordered size="small" :column="1">
              <a-descriptions-item label="编号"><span class="data-value">{{ inspectorSelectedTree.code }}</span></a-descriptions-item>
              <a-descriptions-item label="树种">{{ inspectorSelectedTree.species }}</a-descriptions-item>
              <a-descriptions-item label="位置">{{ inspectorSelectedTree.siteName }}</a-descriptions-item>
              <a-descriptions-item label="胸径">{{ inspectorSelectedTree.dbh ? inspectorSelectedTree.dbh + ' cm' : '未记录' }}</a-descriptions-item>
              <a-descriptions-item label="坐标">{{ inspectorSelectedTree.longitude?.toFixed(6) }}, {{ inspectorSelectedTree.latitude?.toFixed(6) }}</a-descriptions-item>
              <a-descriptions-item label="类型">{{ inspectorSelectedTree.treeType }}</a-descriptions-item>
              <a-descriptions-item label="保护等级">{{ inspectorSelectedTree.protectionLevel || '无' }}</a-descriptions-item>
              <a-descriptions-item label="健康状态">
                <a-tag :color="inspectorSelectedTree.healthStatus === 'healthy' ? 'green' : inspectorSelectedTree.healthStatus === 'problem' ? 'red' : 'orange'">
                  {{ inspectorSelectedTree.healthStatus === 'healthy' ? '正常' : inspectorSelectedTree.healthStatus === 'problem' ? '异常' : '待观察' }}
                </a-tag>
              </a-descriptions-item>
            </a-descriptions>
            <div v-if="inspectorSelectedTree.story" class="story-block">
              <div class="section-title">资料卡片</div>
              <p>{{ inspectorSelectedTree.story }}</p>
            </div>
            <a-button type="primary" block size="large" style="margin-top: 12px;" @click="showCreateOrderModal = true">
              选定此树，创建工单
            </a-button>
          </a-card>
        </template>

        <!-- ====== NAVIGATE MODE: Batch View ====== -->
        <template v-if="pageMode === 'navigate' && navSubMode === 'batch'">
          <a-card class="inspector-main-card" :bordered="false" :title="`${navRoleLabel}树木工单`">
            <div class="pending-summary">
              共 <strong>{{ pendingOrders.length }}</strong> 条{{ navRoleLabel }}工单，涉及 <strong>{{ pendingTrees.length }}</strong> 棵树木
            </div>

            <div v-if="pendingOrders.length === 0" class="empty-hint">
              当前没有{{ navRoleLabel }}的工单
            </div>

            <div
              v-for="order in pendingOrders"
              :key="order.id"
              :class="[
                'order-list-item',
                highlightedOrderId === order.id && navSubMode === 'batch' ? 'highlighted' : '',
                targetOrder?.id === order.id && navSubMode === 'guiding' ? 'target-highlighted' : ''
              ]"
              @click="selectOrderInList(order)"
            >
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span class="data-value" style="font-size:13px;">{{ order.orderNo }}</span>
                <a-tag :color="statusColor[order.status]" size="small">{{ statusLabels[order.status] }}</a-tag>
              </div>
              <div style="font-size:13px;font-weight:500;margin-top:2px;">
                <template v-if="trees.find(t => t.id === order.treeId)">
                  {{ trees.find(t => t.id === order.treeId).code }} / {{ trees.find(t => t.id === order.treeId).species }}
                </template>
                <span v-else>{{ order.treeId }}</span>
              </div>
              <div class="order-meta">
                <span>{{ order.issueType }}</span>
                <span>{{ order.updatedAt }}</span>
              </div>
              <div style="margin-top:8px;display:flex;gap:8px;">
                <a-button size="small" type="primary" @click.stop="startNavigate(order)">
                  <Navigation :size="13" /> 导航
                </a-button>
                <a-button size="small" @click.stop="openOrderDetail(order)">
                  详情
                </a-button>
              </div>
            </div>
          </a-card>
        </template>

        <!-- ====== NAVIGATE MODE: Guiding HUD ====== -->
        <template v-if="pageMode === 'navigate' && navSubMode === 'guiding'">
          <a-card class="nav-hud-card" :bordered="false" title="导航中">
            <div class="nav-target-info">
              {{ targetTree?.code }} / {{ targetTree?.species }}
              <br />{{ targetOrder?.orderNo }}
            </div>
            <div class="nav-distance">{{ guidingDistance }}<small style="font-size:16px;"> 米</small></div>
            <div class="nav-bearing">
              <Navigation :size="16" style="vertical-align:middle;margin-right:4px;" />
              方向：{{ guidingBearing }}
            </div>

            <a-button block style="margin-top:16px;" @click="cancelNavigate">
              退出导航
            </a-button>
            <p style="text-align:center;font-size:11px;margin-top:8px;opacity:0.65;">
              步行接近中…接近到 &lt;10 米时自动到达
            </p>
          </a-card>

          <!-- Also show batch list below HUD (scrollable) -->
          <a-card
            class="inspector-main-card"
            :bordered="false"
            :title="`${navRoleLabel}树木工单`"
            style="margin-top:12px;max-height:300px;"
          >
            <div
              v-for="order in pendingOrders"
              :key="order.id"
              :class="[
                'order-list-item',
                targetOrder?.id === order.id ? 'target-highlighted' : ''
              ]"
              @click="selectOrderInList(order)"
            >
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span class="data-value" style="font-size:12px;">{{ order.orderNo }}</span>
                <a-tag v-if="targetOrder?.id === order.id" color="orange" size="small">导航中</a-tag>
                <a-tag v-else :color="statusColor[order.status]" size="small">{{ statusLabels[order.status] }}</a-tag>
              </div>
              <div style="font-size:12px;font-weight:500;margin-top:2px;">
                <template v-if="trees.find(t => t.id === order.treeId)">
                  {{ trees.find(t => t.id === order.treeId).code }} / {{ trees.find(t => t.id === order.treeId).species }}
                </template>
              </div>
            </div>
          </a-card>
        </template>
      </template>
    </div>

    <!-- ====== Visitor-only: Right Floating Panels ====== -->
    <template v-if="role === 'visitor'">
      <div class="guide-right-panels">
        <!-- Photo Wall -->
        <a-card class="map-panel photo-wall-card" :bordered="false" title="照片墙">
          <div v-if="photoWallPhotos.length === 0" class="empty-hint">
            还没有打卡照片，快去拍照吧 📸
          </div>
          <div v-else class="photo-wall-grid">
            <div
              v-for="photo in photoWallPhotos"
              :key="photo.id"
              class="photo-wall-item"
            >
              <img
                :src="photo.photoUrl"
                :alt="photo.species"
                class="photo-wall-img"
                @click="openPhotoPreview(photo)"
              />
              <div class="photo-wall-info">
                <span class="photo-wall-species">{{ photo.species }}</span>
                <span class="photo-wall-meta">{{ photo.treeCode }} · {{ photo.userName }}</span>
              </div>
              <a-button
                size="small"
                type="text"
                class="photo-wall-like"
                @click="handleLike(photo.id)"
              >
                <Heart
                  :size="14"
                  :fill="photo.likedBy?.length ? '#e74c3c' : 'none'"
                  :color="photo.likedBy?.length ? '#e74c3c' : '#999'"
                />
                {{ photo.likedBy?.length || 0 }}
              </a-button>
            </div>
          </div>
        </a-card>

        <!-- Check-in Leaderboard -->
        <a-card class="map-panel leaderboard-card" :bordered="false" title="打卡排行">
          <div v-if="checkInLeaderboard.length === 0" class="empty-hint">
            暂无排行数据，快去打卡吧
          </div>
          <div v-else class="leaderboard-list">
            <div
              v-for="(entry, idx) in checkInLeaderboard"
              :key="entry.treeId"
              :class="['leaderboard-item', `rank-${idx + 1}`]"
            >
              <span class="rank-badge">
                <Medal v-if="idx < 3" :size="18" :color="rankMedals[idx + 1]" />
                <span v-else class="rank-num">{{ idx + 1 }}</span>
              </span>
              <span class="rank-name">{{ entry.treeCode }} {{ entry.species }}</span>
              <span class="rank-count">{{ entry.count }} 次打卡</span>
            </div>
          </div>
        </a-card>
      </div>
    </template>

    <!-- ====== Create Work Order Modal (inspector) ====== -->
    <CreateWorkOrderModal
      :open="showCreateOrderModal"
      :trees="trees"
      :role="role"
      :current-user="currentUser"
      :current-user-name="currentUserName"
      :pre-selected-tree="inspectorSelectedTree ? { id: inspectorSelectedTree.id, code: inspectorSelectedTree.code, species: inspectorSelectedTree.species } : null"
      @close="showCreateOrderModal = false"
      @create-order="handleCreateWorkOrder"
      @update-tree="handleUpdateTree"
    />

    <!-- ====== Work Order Detail Drawer (inspector/maintenance navigate) ====== -->
    <a-drawer
      :width="460"
      :open="showOrderDetailDrawer"
      @close="closeOrderDetail"
      placement="right"
      title="工单详情"
    >
      <a-space v-if="detailOrder" direction="vertical" :size="16" class="full-width">
        <a-tag :color="statusColor[detailOrder.status]">{{ statusLabels[detailOrder.status] }}</a-tag>

        <a-descriptions bordered size="small" :column="1">
          <a-descriptions-item label="工单编号"><span class="data-value">{{ detailOrder.orderNo }}</span></a-descriptions-item>
          <a-descriptions-item label="问题类型">{{ detailOrder.issueType }}</a-descriptions-item>
          <a-descriptions-item label="问题描述">{{ detailOrder.issueDescription }}</a-descriptions-item>
          <a-descriptions-item label="相对位置">{{ detailOrder.locationDescription }}</a-descriptions-item>
          <a-descriptions-item label="创建人">{{ detailOrder.creatorName ?? roleLabels[detailOrder.creatorRole] }}</a-descriptions-item>
          <a-descriptions-item label="处置人">{{ detailOrder.handlerName ?? '未处置' }}</a-descriptions-item>
          <a-descriptions-item label="复核人">{{ detailOrder.reviewerName ?? '未复核' }}</a-descriptions-item>
          <a-descriptions-item label="创建时间">{{ detailOrder.createdAt }}</a-descriptions-item>
          <a-descriptions-item label="处置时间">{{ detailOrder.processedAt ?? '未处置' }}</a-descriptions-item>
          <a-descriptions-item label="复核时间">{{ detailOrder.reviewedAt ?? '未复核' }}</a-descriptions-item>
          <a-descriptions-item label="归档时间">{{ detailOrder.archivedAt ?? '未归档' }}</a-descriptions-item>
        </a-descriptions>

        <a-descriptions v-if="trees.find(t => t.id === detailOrder.treeId)" bordered size="small" :column="1">
          <a-descriptions-item label="树木编号"><span class="data-value">{{ trees.find(t => t.id === detailOrder.treeId).code }}</span></a-descriptions-item>
          <a-descriptions-item label="树种">{{ trees.find(t => t.id === detailOrder.treeId).species }}</a-descriptions-item>
          <a-descriptions-item label="胸径">{{ trees.find(t => t.id === detailOrder.treeId).dbh ? trees.find(t => t.id === detailOrder.treeId).dbh + ' cm' : '未记录' }}</a-descriptions-item>
          <a-descriptions-item label="健康状态">{{ healthLabels[trees.find(t => t.id === detailOrder.treeId).healthStatus] }}</a-descriptions-item>
        </a-descriptions>

        <div v-if="detailOrder.createPhotos?.length" class="story-block">
          <div class="section-title">创建照片</div>
          <div class="photo-strip">
            <img v-for="photo in detailOrder.createPhotos" :key="photo.uid" :src="photo.url" :alt="photo.name" />
          </div>
        </div>

        <div v-if="detailOrder.treatmentMeasures" class="story-block">
          <div class="section-title">处置反馈</div>
          <p>{{ detailOrder.treatmentMeasures }}</p>
          <div v-if="detailOrder.treatmentPhotos?.length" class="photo-strip">
            <img v-for="photo in detailOrder.treatmentPhotos" :key="photo.uid" :src="photo.url" :alt="photo.name" />
          </div>
        </div>

        <div v-if="detailOrder.reviewComment" class="story-block">
          <div class="section-title">复核意见</div>
          <p>{{ detailOrder.reviewComment }}</p>
        </div>

        <!-- Treatment form (maintenance) -->
        <div v-if="role === 'maintenance' && detailOrder.status === 'processing'" class="edit-box">
          <div class="section-title"><Wrench :size="16" />处置反馈</div>
          <a-form layout="vertical" :model="guideTreatmentForm" @finish="submitTreatmentInGuide">
            <a-form-item label="处置措施" required>
              <a-textarea v-model:value="guideTreatmentForm.treatmentMeasures" :rows="4" placeholder="填写修剪、清理、支撑、病虫害处理等措施" />
            </a-form-item>
            <a-form-item label="处置照片" required>
              <a-upload v-model:file-list="guideTreatmentPhotos" :before-upload="() => false" :max-count="4" list-type="picture">
                <a-button>添加处置照片</a-button>
              </a-upload>
            </a-form-item>
            <a-button class="submit-report" type="primary" html-type="submit">
              <Wrench :size="16" />提交复核
            </a-button>
          </a-form>
        </div>

        <!-- Review form (inspector) -->
        <div v-if="role === 'inspector' && detailOrder.status === 'reviewing'" class="edit-box">
          <div class="section-title"><CheckCircle2 :size="16" />复核处理</div>
          <a-form layout="vertical">
            <a-form-item label="复核后健康状态" required>
              <a-select v-model:value="guideReviewForm.healthStatus" :options="healthOptions" />
            </a-form-item>
            <a-form-item label="复核意见">
              <a-textarea v-model:value="guideReviewForm.reviewComment" :rows="3" placeholder="填写复核意见" />
            </a-form-item>
            <a-space wrap>
              <a-button type="primary" @click="submitReviewInGuide(true)">通过并归档</a-button>
              <a-button danger @click="submitReviewInGuide(false)">退回待处置</a-button>
            </a-space>
          </a-form>
        </div>
      </a-space>
    </a-drawer>

    <!-- ====== Tree Detail Drawer (visitor check-in) ====== -->
    <a-drawer
      :width="430"
      :open="showTreeDrawer"
      @close="closeViewTree"
      placement="right"
    >
      <template v-if="viewingTree" #title>
        <div class="drawer-title">
          <span>{{ viewingTree.species }}</span>
        </div>
      </template>

      <a-space v-if="viewingTree" direction="vertical" :size="16" class="full-width">
        <img
          v-if="viewingTree.photos?.[0]"
          :src="viewingTree.photos[0]"
          :alt="viewingTree.species"
          class="tree-photo"
        />

        <a-descriptions bordered size="small" :column="1">
          <a-descriptions-item label="编号">
            <span class="data-value">{{ viewingTree.code }}</span>
          </a-descriptions-item>
          <a-descriptions-item label="位置">{{ viewingTree.siteName }}</a-descriptions-item>
          <a-descriptions-item label="胸径">{{ viewingTree.dbh ? viewingTree.dbh + ' cm' : '未记录' }}</a-descriptions-item>
          <a-descriptions-item label="坐标">{{ viewingTree.longitude?.toFixed(6) }}, {{ viewingTree.latitude?.toFixed(6) }}</a-descriptions-item>
          <a-descriptions-item label="类型">{{ viewingTree.treeType }}</a-descriptions-item>
          <a-descriptions-item label="保护等级">{{ viewingTree.protectionLevel || '无' }}</a-descriptions-item>
        </a-descriptions>

        <div v-if="viewingTree.story" class="story-block">
          <div class="section-title">资料卡片</div>
          <p>{{ viewingTree.story }}</p>
        </div>

        <div class="checkin-section">
          <input
            ref="cameraInput"
            type="file"
            capture="environment"
            accept="image/*"
            style="display: none"
            @change="onCameraCapture"
          />
          <a-button type="primary" block size="large" @click="triggerCamera">
            <Camera :size="18" />拍照打卡
          </a-button>
          <p class="checkin-hint">拍照后自动发布至照片墙，并解锁该树种图鉴</p>
        </div>
      </a-space>
    </a-drawer>

    <!-- ====== Photo Preview Modal ====== -->
    <Teleport to="body">
      <Transition name="stats-modal">
        <div
          v-if="previewPhoto"
          class="stats-modal-backdrop"
          @click="closePhotoPreview"
        >
          <div class="photo-preview-container" @click.stop>
            <button
              type="button"
              class="stats-modal-close"
              aria-label="关闭"
              @click="closePhotoPreview"
            >
              <X :size="20" />
            </button>
            <img
              :src="previewPhoto.photoUrl"
              :alt="previewPhoto.species"
              class="photo-preview-img"
            />
            <div class="photo-preview-info">
              <span>{{ previewPhoto.species }}</span>
              <span>{{ previewPhoto.treeCode }} · {{ previewPhoto.userName }}</span>
              <span>{{ previewPhoto.createdAt }}</span>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
