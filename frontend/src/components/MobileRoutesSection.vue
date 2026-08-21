<script setup>
import { computed, inject, ref } from "vue";
import { message } from "ant-design-vue";
import { Camera, CheckCircle2, MapPin, Navigation, Route as RouteIcon, Trees, X } from "lucide-vue-next";
import ArcGISTreeMap from "./ArcGISTreeMap.vue";
import { bearingToText, calculateBearing, haversineDistance } from "../api/mockApi";
import { isAmapKeyConfigured, planAmapWalkingRoute } from "../api/amap";
import { photoSpots as allPhotoSpots } from "../data/photoSpots";

const app = inject("appState");
const { trees, speciesColors } = app;

// 缓冲区中心取景区树木点位均值，半径覆盖景区及周边可步行范围。
const PARK_ZONES = [
  {
    id: "daxingshansi",
    siteName: "大兴善寺",
    center: { lat: 34.228779, lng: 108.938921 },
    radiusM: 500,
    windows: [
      { key: "3-4", label: "3~4月", species: ["樱花", "樱桃李", "紫藤"] },
      { key: "6-7", label: "6~7月", species: ["女贞"] },
      { key: "7-8", label: "7~8月", species: ["槐树", "国槐"] },
      { key: "9-10", label: "9~10月", species: ["桂花"] },
      { key: "10-11", label: "10~11月", species: ["银杏", "枫树"] },
    ],
  },
  {
    id: "tangdacien-temple-park",
    siteName: "唐大慈恩寺遗址公园",
    center: { lat: 34.21916, lng: 108.96227 },
    radiusM: 500,
    windows: [
      { key: "10-11-1", label: "10~11月", species: ["银杏", "枫树"] },
    ],
  },
];

const mapRef = ref(null);
const business = ref(null);
const isLocating = ref(false);
const currentPosition = ref(null);
const matchedPark = ref(null);
const selectedWindow = ref(null);
const selectedPhotoSpotIds = ref([]);
const activeSpot = ref(null);
const isPickingPosition = ref(false);
const photoDestinationId = ref(null);
const seasonalDestinationPoint = ref(null);
const navigationActive = ref(false);
const routeOrder = ref([]);
const routeTotalMeters = ref(0);
const amapPolylines = ref([]);
const routeUsingAmap = ref(false);
const isPlanningRoute = ref(false);
const routeDurationSeconds = ref(0);
const routePanelLevel = ref("mid");
const panelDrag = ref({ active: false, startY: 0, currentY: 0, moved: false });
const seasonalPickedPoints = ref([]);
const isPickingSeasonalPoint = ref(false);
const isPickingSeasonalDestination = ref(false);

const windowTrees = computed(() => {
  if (!matchedPark.value || !selectedWindow.value) return [];
  return trees.value.filter(
    (tree) => tree.siteName === matchedPark.value.siteName && selectedWindow.value.species.includes(tree.species)
  );
});
const highlightedTreeIds = computed(() => windowTrees.value.map((tree) => tree.id));
const photoSpotsForPark = computed(() =>
  allPhotoSpots.filter((spot) => spot.siteName === matchedPark.value?.siteName)
);
const photoSpotsForMap = computed(() => (business.value === "photo" ? photoSpotsForPark.value : []));
const selectedPhotoSpots = computed(() =>
  photoSpotsForPark.value.filter((spot) => selectedPhotoSpotIds.value.includes(spot.id))
);
const positionLabel = computed(() => {
  if (!currentPosition.value) return "未定位";
  return `${Number(currentPosition.value.lat).toFixed(5)}, ${Number(currentPosition.value.lng).toFixed(5)}`;
});
const destination = computed(() => {
  if (business.value === "photo") {
    const spot = photoSpotsForPark.value.find((item) => item.id === photoDestinationId.value);
    return spot ? { lat: spot.latitude, lng: spot.longitude, name: `${spot.code} / ${spot.name}` } : null;
  }
  if (business.value === "seasonal") {
    const point = seasonalDestinationPoint.value;
    return point ? { lat: point.lat, lng: point.lng, name: point.name || "自定义终点" } : null;
  }
  return null;
});
const destinationLabel = computed(() => destination.value?.name || "未选择");
const routeDurationMinutes = computed(() =>
  routeDurationSeconds.value
    ? Math.max(1, Math.round(routeDurationSeconds.value / 60))
    : Math.max(1, Math.round(routeTotalMeters.value / 80))
);
const businessTitle = computed(() => (business.value === "photo" ? "拍照机位路线" : "季节主题路线"));
const routePanelClass = computed(() => `panel-${routePanelLevel.value}`);

function setRoutePanelLevelByDirection(deltaY) {
  if (deltaY < -22) {
    routePanelLevel.value = "expanded";
    return;
  }
  if (deltaY > 22) {
    routePanelLevel.value = routePanelLevel.value === "expanded" ? "mid" : "compact";
  }
}

function handleRoutePanelPointerDown(event) {
  panelDrag.value = { active: true, startY: event.clientY, currentY: event.clientY, moved: false };
  event.currentTarget?.setPointerCapture?.(event.pointerId);
}

function handleRoutePanelPointerMove(event) {
  if (!panelDrag.value.active) return;
  const deltaY = event.clientY - panelDrag.value.startY;
  panelDrag.value = { ...panelDrag.value, currentY: event.clientY, moved: Math.abs(deltaY) > 8 };
  setRoutePanelLevelByDirection(deltaY);
}

function handleRoutePanelPointerUp(event) {
  if (!panelDrag.value.active) return;
  const deltaY = event.clientY - panelDrag.value.startY;
  if (!panelDrag.value.moved) {
    routePanelLevel.value = routePanelLevel.value === "expanded" ? "compact" : "expanded";
  } else {
    setRoutePanelLevelByDirection(deltaY);
  }
  panelDrag.value = { active: false, startY: 0, currentY: 0, moved: false };
  event.currentTarget?.releasePointerCapture?.(event.pointerId);
}

function openSeasonalRoute() {
  business.value = "seasonal";
  resetRouteState();
  locateVisitor();
}

function openPhotoRoute() {
  business.value = "photo";
  resetRouteState();
  locateVisitor();
}

function backToBusiness() {
  business.value = null;
  resetRouteState();
}

function resetRouteState() {
  selectedWindow.value = null;
  selectedPhotoSpotIds.value = [];
  activeSpot.value = null;
  photoDestinationId.value = null;
  seasonalDestinationPoint.value = null;
  isPickingPosition.value = false;
  isPickingSeasonalPoint.value = false;
  isPickingSeasonalDestination.value = false;
  navigationActive.value = false;
  routeOrder.value = [];
  routeTotalMeters.value = 0;
  amapPolylines.value = [];
  routeUsingAmap.value = false;
  isPlanningRoute.value = false;
  routeDurationSeconds.value = 0;
  clearMapOverlays();
}

function locateVisitor() {
  if (!navigator.geolocation) {
    message.warning("您的浏览器不支持地理定位");
    return;
  }
  isLocating.value = true;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      currentPosition.value = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      isLocating.value = false;
      resolveMatchedPark();
    },
    (error) => {
      isLocating.value = false;
      if (error.code === 1) {
        message.error("定位权限被拒绝，请在浏览器设置中允许定位");
      } else {
        message.error("获取定位失败，请稍后重试");
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
}

function resolveMatchedPark() {
  const pos = currentPosition.value;
  const park = PARK_ZONES.find(
    (zone) => haversineDistance(pos.lat, pos.lng, zone.center.lat, zone.center.lng) <= zone.radiusM
  ) || null;
  matchedPark.value = park;
  resetRouteState();
  if (park) {
    message.success(`已识别${park.siteName}路线方案`);
  } else {
    message.info("当前位置不在已开通路线的景区缓冲区内");
  }
}

function selectWindow(window) {
  if (!matchedPark.value) return;
  selectedWindow.value = window;
  seasonalPickedPoints.value = loadSeasonalPickedPoints(window.key);
  seasonalDestinationPoint.value = loadSeasonalDestination(window.key);
  isPickingSeasonalPoint.value = false;
  isPickingSeasonalDestination.value = false;
  navigationActive.value = false;
  routeOrder.value = [];
  routeTotalMeters.value = 0;
  amapPolylines.value = [];
  routeUsingAmap.value = false;
  routeDurationSeconds.value = 0;
  clearMapOverlays();
  if (windowTrees.value.length === 0) {
    message.warning("该观赏窗口暂无对应树木数据");
    return;
  }
  const center = getCenter(windowTrees.value);
  mapRef.value?.flyTo(center.lat, center.lng, 18);
  message.success(`已高亮 ${windowTrees.value.length} 棵${window.label}树木`);
}

function clearMapOverlays() {
  mapRef.value?.clearCustomOverlays();
}

const SEASONAL_PICKED_STORAGE_KEY = "tree-service-seasonal-picked-points-v1";

function loadSeasonalPickedPoints(windowKey) {
  try {
    const raw = localStorage.getItem(SEASONAL_PICKED_STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return Array.isArray(data[windowKey]) ? data[windowKey] : [];
  } catch {
    return [];
  }
}

function saveSeasonalPickedPoints(windowKey, points) {
  try {
    const raw = localStorage.getItem(SEASONAL_PICKED_STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    data[windowKey] = points;
    localStorage.setItem(SEASONAL_PICKED_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage 不可用时静默失败
  }
}

const SEASONAL_DESTINATION_STORAGE_KEY = "tree-service-seasonal-destinations-v1";

function loadSeasonalDestination(windowKey) {
  try {
    const raw = localStorage.getItem(SEASONAL_DESTINATION_STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return data[windowKey] || null;
  } catch {
    return null;
  }
}

function saveSeasonalDestination(windowKey, point) {
  try {
    const raw = localStorage.getItem(SEASONAL_DESTINATION_STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    if (point) {
      data[windowKey] = point;
    } else {
      delete data[windowKey];
    }
    localStorage.setItem(SEASONAL_DESTINATION_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage 不可用时静默失败
  }
}

function toggleSeasonalPointPick() {
  isPickingSeasonalPoint.value = !isPickingSeasonalPoint.value;
  isPickingPosition.value = false;
  isPickingSeasonalDestination.value = false;
  if (isPickingSeasonalPoint.value) {
    message.info("请在地图上点击，添加自定义途经点");
  }
}

function toggleSeasonalDestinationPick() {
  isPickingSeasonalDestination.value = !isPickingSeasonalDestination.value;
  isPickingPosition.value = false;
  isPickingSeasonalPoint.value = false;
  if (isPickingSeasonalDestination.value) {
    message.info("请在地图上点击，定义该窗口终点");
  }
}

function setSeasonalDestination(latitude, longitude) {
  if (!selectedWindow.value) return;
  const point = {
    lat: Number(latitude),
    lng: Number(longitude),
    name: `自定义终点（${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}）`,
  };
  seasonalDestinationPoint.value = point;
  saveSeasonalDestination(selectedWindow.value.key, point);
  isPickingSeasonalDestination.value = false;
  redrawSeasonalOverlays();
  message.success("已定义该窗口终点");
}

function clearSeasonalDestination() {
  if (!selectedWindow.value) return;
  seasonalDestinationPoint.value = null;
  saveSeasonalDestination(selectedWindow.value.key, null);
  redrawSeasonalOverlays();
}

function addSeasonalPickedPoint(latitude, longitude) {
  if (!selectedWindow.value) return;
  const point = {
    id: `picked-${Date.now()}-${seasonalPickedPoints.value.length}`,
    lat: Number(latitude),
    lng: Number(longitude),
    label: `自定义点${seasonalPickedPoints.value.length + 1}`,
  };
  seasonalPickedPoints.value = [...seasonalPickedPoints.value, point];
  saveSeasonalPickedPoints(selectedWindow.value.key, seasonalPickedPoints.value);
  redrawSeasonalOverlays();
  message.success(`已添加 ${point.label}`);
}

function removeSeasonalPickedPoint(id) {
  if (!selectedWindow.value) return;
  seasonalPickedPoints.value = seasonalPickedPoints.value.filter((point) => point.id !== id);
  saveSeasonalPickedPoints(selectedWindow.value.key, seasonalPickedPoints.value);
  redrawSeasonalOverlays();
}

function clearSeasonalPickedPoints() {
  if (!selectedWindow.value) return;
  seasonalPickedPoints.value = [];
  saveSeasonalPickedPoints(selectedWindow.value.key, []);
  redrawSeasonalOverlays();
  message.success("已清空自定义途经点");
}

function redrawSeasonalOverlays() {
  const map = mapRef.value;
  if (!map) return;
  map.clearCustomOverlays();
  if (currentPosition.value) {
    map.showLocationMarker(currentPosition.value.lat, currentPosition.value.lng);
  }
  if (destination.value) {
    map.showTargetMarker(destination.value.lat, destination.value.lng, "destination", null);
  }
  seasonalPickedPoints.value.forEach((point) => {
    map.showTargetMarker(point.lat, point.lng, "picked-waypoint", null);
  });
}

function handleMapClick({ latitude, longitude }) {
  if (business.value === "seasonal" && isPickingSeasonalDestination.value) {
    setSeasonalDestination(latitude, longitude);
    return;
  }
  if (business.value === "seasonal" && isPickingSeasonalPoint.value) {
    addSeasonalPickedPoint(latitude, longitude);
    return;
  }
  if (!isPickingPosition.value) return;
  currentPosition.value = { lat: latitude, lng: longitude };
  isPickingPosition.value = false;
  resolveMatchedPark();
}

function handleTreeSelect(tree) {
  if (!tree) return;
  if (isPickingSeasonalDestination.value) {
    setSeasonalDestination(tree.latitude, tree.longitude);
    return;
  }
  if (!isPickingPosition.value) return;
  currentPosition.value = { lat: tree.latitude, lng: tree.longitude };
  isPickingPosition.value = false;
  resolveMatchedPark();
}

function handlePhotoSpotSelect(spot) {
  if (isPickingPosition.value) {
    currentPosition.value = { lat: spot.latitude, lng: spot.longitude };
    isPickingPosition.value = false;
    resolveMatchedPark();
    return;
  }
  activeSpot.value = spot;
}

function togglePhotoSpotSelection(spot) {
  if (!spot) return;
  const next = new Set(selectedPhotoSpotIds.value);
  if (next.has(spot.id)) {
    next.delete(spot.id);
  } else {
    next.add(spot.id);
    if (photoDestinationId.value === spot.id) photoDestinationId.value = null;
  }
  selectedPhotoSpotIds.value = [...next];
}

function isPhotoSpotSelected(spot) {
  return spot && selectedPhotoSpotIds.value.includes(spot.id);
}

function isPhotoSpotDestination(spot) {
  return spot && photoDestinationId.value === spot.id;
}

function chooseSpotDestination(spot) {
  if (!spot) return;
  if (photoDestinationId.value === spot.id) {
    photoDestinationId.value = null;
    redrawSeasonalOverlays();
    return;
  }
  photoDestinationId.value = spot.id;
  selectedPhotoSpotIds.value = selectedPhotoSpotIds.value.filter((id) => id !== spot.id);
  redrawSeasonalOverlays();
  message.success("终点已选择，可开始导航");
}

function clearDestination() {
  if (business.value === "photo") {
    photoDestinationId.value = null;
  } else if (business.value === "seasonal") {
    clearSeasonalDestination();
  }
  redrawSeasonalOverlays();
  message.success("已清除终点");
}

function startMapPositionPick() {
  isPickingPosition.value = true;
  isPickingSeasonalPoint.value = false;
  isPickingSeasonalDestination.value = false;
  message.info("请在地图上点击选择当前位置");
}

async function startNavigation() {
  if (!matchedPark.value) return;
  if (business.value === "seasonal" && !selectedWindow.value) return;
  if (!currentPosition.value) {
    message.info("请先定位当前位置");
    locateVisitor();
    return;
  }
  if (!destination.value) {
    message.info(business.value === "seasonal" ? "请先定义该窗口终点" : "请先选择一个机位作为终点");
    return;
  }

  let waypoints =
    business.value === "photo"
      ? selectedPhotoSpots.value.filter((spot) => spot.id !== photoDestinationId.value)
      : windowTrees.value;
  let usingPickedPoints = false;
  if (business.value === "seasonal" && seasonalPickedPoints.value.length > 0) {
    usingPickedPoints = true;
    waypoints = seasonalPickedPoints.value.map((point) => ({
      ...point,
      latitude: point.lat,
      longitude: point.lng,
    }));
  }
  const ordered = planShortestPath(currentPosition.value, waypoints, destination.value);
  routeOrder.value = ordered;
  console.log(
    "规划路线途经点：",
    ordered.map((point) => ({
      type: point.type,
      label: point.label,
      lat: Number(point.lat).toFixed(6),
      lng: Number(point.lng).toFixed(6),
    }))
  );
  routeTotalMeters.value = ordered.slice(0, -1).reduce(
    (sum, point, index) =>
      sum + haversineDistance(point.lat, point.lng, ordered[index + 1].lat, ordered[index + 1].lng),
    0
  );
  routeUsingAmap.value = false;
  amapPolylines.value = [];
  routeDurationSeconds.value = 0;

  if (isAmapKeyConfigured()) {
    isPlanningRoute.value = true;
    try {
      const result = await planAmapWalkingRoute(ordered);
      amapPolylines.value = result.polylines;
      routeUsingAmap.value = true;
      routeTotalMeters.value = result.totalMeters;
      routeDurationSeconds.value = result.totalSeconds;
    } catch (error) {
      message.warning("高德路线规划失败，已用直线距离估算");
    } finally {
      isPlanningRoute.value = false;
    }
  } else {
    message.info("未配置高德 Key，已用直线距离估算");
  }

  navigationActive.value = true;
  drawNavigationRoute();
  message.success(
    usingPickedPoints ? `已规划 ${waypoints.length} 个自定义途经点的路线` : `已规划 ${waypoints.length} 个途经点的路线`
  );
}

function planShortestPath(start, waypoints, end) {
  const remaining = waypoints.map((item) => ({
    lat: Number(item.latitude ?? item.lat),
    lng: Number(item.longitude ?? item.lng),
    label: item.label || (item.code ? `${item.code} / ${item.name || item.species}` : "途经点"),
    id: item.id || item.treeId,
  }));
  const ordered = [{ ...start, label: "当前位置", type: "start" }];
  let current = start;

  while (remaining.length) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    remaining.forEach((point, index) => {
      const dist = haversineDistance(current.lat, current.lng, point.lat, point.lng);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestIndex = index;
      }
    });
    const next = remaining.splice(bestIndex, 1)[0];
    ordered.push({ ...next, type: "waypoint" });
    current = next;
  }

  ordered.push({ ...end, label: end.name || "终点", type: "destination" });
  optimizeTwoOpt(ordered);
  return ordered;
}

function optimizeTwoOpt(points) {
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < points.length - 2; i++) {
      for (let k = i + 1; k < points.length - 1; k++) {
        const before = segmentDistance(points, i - 1, i) + segmentDistance(points, k, k + 1);
        const after = segmentDistance(points, i - 1, k) + segmentDistance(points, i, k + 1);
        if (after + 1e-9 < before) {
          reverseSegment(points, i, k);
          improved = true;
        }
      }
    }
  }
}

function segmentDistance(points, fromIndex, toIndex) {
  const from = points[fromIndex];
  const to = points[toIndex];
  return haversineDistance(from.lat, from.lng, to.lat, to.lng);
}

function reverseSegment(points, startIndex, endIndex) {
  while (startIndex < endIndex) {
    const temp = points[startIndex];
    points[startIndex] = points[endIndex];
    points[endIndex] = temp;
    startIndex++;
    endIndex--;
  }
}

function drawNavigationRoute() {
  const map = mapRef.value;
  if (!map || routeOrder.value.length === 0) return;
  map.clearCustomOverlays();

  const first = routeOrder.value[0];
  const last = routeOrder.value[routeOrder.value.length - 1];
  map.showLocationMarker(first.lat, first.lng);
  if (routeUsingAmap.value && amapPolylines.value.length > 0) {
    amapPolylines.value.forEach((polyline) => map.showRoutePolyline(polyline));
  } else {
    for (let i = 0; i < routeOrder.value.length - 1; i++) {
      const from = routeOrder.value[i];
      const to = routeOrder.value[i + 1];
      map.showNavigationLine(from.lat, from.lng, to.lat, to.lng);
    }
  }
  for (let i = 1; i < routeOrder.value.length - 1; i++) {
    const point = routeOrder.value[i];
    map.showTargetMarker(point.lat, point.lng, "waypoint", null);
  }
  map.showTargetMarker(last.lat, last.lng, "destination", null);

  const center = getCenter(routeOrder.value);
  map.flyTo(center.lat, center.lng, 16);
}

function endNavigation() {
  navigationActive.value = false;
  routeOrder.value = [];
  routeTotalMeters.value = 0;
  amapPolylines.value = [];
  routeUsingAmap.value = false;
  routeDurationSeconds.value = 0;
  clearMapOverlays();
  if (business.value === "photo" && selectedPhotoSpots.value.length) {
    const center = getCenter(selectedPhotoSpots.value);
    mapRef.value?.flyTo(center.lat, center.lng, 17);
  } else if (windowTrees.value.length) {
    const center = getCenter(windowTrees.value);
    mapRef.value?.flyTo(center.lat, center.lng, 17);
  }
  message.success("已结束导航");
}

function stepMeters(index) {
  const from = routeOrder.value[index - 1];
  const to = routeOrder.value[index];
  if (!from || !to) return 0;
  return haversineDistance(from.lat, from.lng, to.lat, to.lng);
}

function stepBearing(index) {
  const from = routeOrder.value[index - 1];
  const to = routeOrder.value[index];
  if (!from || !to) return "";
  return bearingToText(calculateBearing(from.lat, from.lng, to.lat, to.lng));
}

function formatDistance(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`;
}

function getCenter(points) {
  if (!points.length) return { lat: 34.228779, lng: 108.938921 };
  const lat = points.reduce((sum, point) => sum + Number(point.latitude ?? point.lat), 0) / points.length;
  const lng = points.reduce((sum, point) => sum + Number(point.longitude ?? point.lng), 0) / points.length;
  return { lat, lng };
}
</script>

<template>
  <div class="mobile-routes-root">
    <div class="mobile-route-map-wrap">
      <ArcGISTreeMap
        ref="mapRef"
        :trees="trees"
        :species-colors="speciesColors"
        :highlighted-tree-ids="highlightedTreeIds"
        :photo-spots="photoSpotsForMap"
        :selected-photo-spot-ids="selectedPhotoSpotIds"
        @tree-select="handleTreeSelect"
        @map-click="handleMapClick"
        @photo-spot-select="handlePhotoSpotSelect"
      />
    </div>

    <div class="mobile-route-panel" :class="routePanelClass">
      <button
        type="button"
        class="mobile-route-panel-handle"
        aria-label="拖动调整路线面板高度"
        @pointerdown="handleRoutePanelPointerDown"
        @pointermove="handleRoutePanelPointerMove"
        @pointerup="handleRoutePanelPointerUp"
        @pointercancel="handleRoutePanelPointerUp"
      >
        <span></span>
        <em>{{ routePanelLevel === 'expanded' ? '下滑收起' : '上滑展开' }}</em>
      </button>

      <template v-if="business === null">
        <div class="mobile-card-title"><RouteIcon :size="17" />路线服务</div>
        <p class="mobile-route-copy">选择一种路线服务，系统会根据当前位置推荐对应景区的游览方案。</p>
        <div class="mobile-route-business-grid">
          <button type="button" class="mobile-route-business-card featured" @click="openPhotoRoute">
            <Camera :size="20" />
            <strong>拍照机位路线</strong>
            <span>按景区推荐拍照机位，支持多机位路径导航</span>
          </button>
          <button type="button" class="mobile-route-business-card" @click="openSeasonalRoute">
            <Trees :size="20" />
            <strong>季节主题路线</strong>
            <span>按观赏窗口推荐树木路线</span>
          </button>
        </div>
      </template>

      <template v-else>
        <div class="mobile-route-heading-row">
          <div class="mobile-card-title">
            <component :is="business === 'photo' ? Camera : Trees" :size="17" />
            {{ businessTitle }}
          </div>
          <button type="button" class="mobile-route-back" @click="backToBusiness">返回</button>
        </div>

        <div class="mobile-route-locate-row">
          <span><MapPin :size="14" />{{ positionLabel }}</span>
          <div class="mobile-route-locate-actions">
            <a-button size="small" :loading="isLocating" @click="locateVisitor">
              <Navigation :size="13" />重新定位
            </a-button>
            <a-button size="small" :type="isPickingPosition ? 'primary' : 'default'" @click="startMapPositionPick">
              <MapPin :size="13" />地图选点
            </a-button>
          </div>
        </div>
        <p v-if="isPickingPosition" class="mobile-route-hint">点击地图任意位置、树木或机位作为当前位置</p>

        <template v-if="!matchedPark">
          <p class="mobile-route-copy">当前定位不在已开通路线景区的缓冲区内，请移动到景区附近或使用“地图选点”选择位置。</p>
        </template>

        <template v-else>
          <div class="mobile-route-park-name">
            <strong>{{ matchedPark.siteName }}</strong>
            <span>{{ business === 'photo' ? `${photoSpotsForPark.length} 个拍照机位` : `${matchedPark.windows.length} 个观赏窗口` }}</span>
          </div>

          <template v-if="business === 'seasonal'">
            <div class="mobile-window-chips">
              <button
                v-for="window in matchedPark.windows"
                :key="window.key"
                type="button"
                :class="{ active: selectedWindow && selectedWindow.key === window.key }"
                @click="selectWindow(window)"
              >
                {{ window.label }}
              </button>
            </div>

            <template v-if="selectedWindow">
              <div class="mobile-route-window-summary">
                <span>{{ selectedWindow.label }} · {{ windowTrees.length }} 棵树木</span>
                <strong>{{ selectedWindow.species.join(" / ") }}</strong>
              </div>
              <div class="mobile-route-picked-block">
                <div class="mobile-info-row">
                  <span>自定义途经点</span>
                  <strong>{{ seasonalPickedPoints.length }} 个</strong>
                </div>
                <div class="mobile-action-row">
                  <a-button
                    size="small"
                    :type="isPickingSeasonalPoint ? 'primary' : 'default'"
                    @click="toggleSeasonalPointPick"
                  >
                    <MapPin :size="13" />地图选点
                  </a-button>
                  <a-button size="small" danger :disabled="seasonalPickedPoints.length === 0" @click="clearSeasonalPickedPoints">
                    <X :size="13" />清空
                  </a-button>
                </div>
                <p v-if="isPickingSeasonalPoint" class="mobile-route-hint">点击地图添加自定义途经点</p>
                <div v-if="seasonalPickedPoints.length" class="mobile-route-tree-picks">
                  <button
                    v-for="point in seasonalPickedPoints"
                    :key="point.id"
                    type="button"
                    @click="removeSeasonalPickedPoint(point.id)"
                  >
                    <span><strong>{{ point.label }}</strong>{{ point.lat.toFixed(5) }}, {{ point.lng.toFixed(5) }}</span>
                    <em>移除</em>
                  </button>
                </div>
              </div>
              <div class="mobile-action-row">
                <a-button
                  size="small"
                  :type="isPickingSeasonalDestination ? 'primary' : 'default'"
                  @click="toggleSeasonalDestinationPick"
                >
                  <MapPin :size="13" />定义终点
                </a-button>
                <a-button size="small" danger :disabled="!seasonalDestinationPoint" @click="clearSeasonalDestination">
                  <X :size="13" />清除终点
                </a-button>
              </div>
              <p v-if="isPickingSeasonalDestination" class="mobile-route-hint">点击地图定义该窗口终点</p>
              <div v-if="seasonalDestinationPoint" class="mobile-info-row">
                <span>已定义终点</span>
                <strong>{{ seasonalDestinationPoint.lat.toFixed(5) }}, {{ seasonalDestinationPoint.lng.toFixed(5) }}</strong>
              </div>
            </template>
          </template>

          <template v-else-if="business === 'photo'">
            <p v-if="photoSpotsForPark.length === 0" class="mobile-route-copy">该景区暂无机位数据。</p>
            <div v-else class="mobile-spot-list">
              <article
                v-for="spot in photoSpotsForPark"
                :key="spot.id"
                class="mobile-spot-card"
                :class="{ selected: isPhotoSpotSelected(spot), destination: isPhotoSpotDestination(spot) }"
              >
                <button type="button" class="mobile-spot-card-main" @click="handlePhotoSpotSelect(spot)">
                  <span class="mobile-spot-card-top">
                    <strong>{{ spot.code }}</strong>
                    <em>{{ spot.name }}</em>
                  </span>
                  <p>{{ spot.description }}</p>
                </button>
                <div class="mobile-spot-card-actions">
                  <button
                    type="button"
                    class="mobile-spot-card-action"
                    :class="{ selected: isPhotoSpotSelected(spot) }"
                    @click="togglePhotoSpotSelection(spot)"
                  >
                    <CheckCircle2 v-if="isPhotoSpotSelected(spot)" :size="13" />
                    {{ isPhotoSpotSelected(spot) ? "已选途经点" : "选为途经点" }}
                  </button>
                  <button
                    type="button"
                    class="mobile-spot-card-action destination"
                    :class="{ selected: isPhotoSpotDestination(spot) }"
                    @click="chooseSpotDestination(spot)"
                  >
                    <Navigation v-if="isPhotoSpotDestination(spot)" :size="13" />
                    {{ isPhotoSpotDestination(spot) ? "已设终点" : "设为终点" }}
                  </button>
                </div>
              </article>
            </div>
          </template>

          <template v-if="(business === 'photo' && photoSpotsForPark.length) || (business === 'seasonal' && selectedWindow)">
            <div class="mobile-route-destination-block">
              <div class="mobile-info-row">
                <span>{{ business === 'photo' ? '已选机位' : '已选树木' }}</span>
                <strong>{{ business === 'photo' ? `${selectedPhotoSpotIds.length} 个` : `${windowTrees.length} 棵` }}</strong>
              </div>
              <div class="mobile-info-row">
                <span>终点</span>
                <strong>{{ destinationLabel }}</strong>
              </div>
              <p v-if="business === 'photo' && !destination" class="mobile-route-hint">
                请先选择一个机位作为终点
              </p>
              <div class="mobile-action-row">
                <a-button
                  type="primary"
                  :disabled="business === 'photo' && !destination"
                  :loading="isPlanningRoute"
                  @click="startNavigation"
                >
                  <Navigation :size="14" />开始导航
                </a-button>
                <a-button size="small" danger :disabled="!destination" @click="clearDestination">
                  <X :size="13" />清除终点
                </a-button>
              </div>
            </div>
          </template>

          <template v-if="navigationActive">
            <div class="mobile-route-nav-summary">
              <div><strong>{{ routeTotalMeters.toFixed(0) }}</strong><span>米</span></div>
              <div><strong>{{ routeDurationMinutes }}</strong><span>分钟</span></div>
              <div><strong>{{ routeOrder.length - 2 }}</strong><span>途经点</span></div>
            </div>
            <p class="mobile-route-hint" style="text-align:center;margin-top:8px;">
              {{ routeUsingAmap ? "高德步行路线 · 实时路径" : "直线距离估算（未配置高德 Key）" }}
            </p>

            <div class="mobile-route-steps">
              <div
                v-for="(point, index) in routeOrder"
                :key="`${point.type}-${index}`"
                class="mobile-route-step"
              >
                <span class="mobile-route-step-index">
                  {{ index === 0 ? "起" : index === routeOrder.length - 1 ? "终" : index }}
                </span>
                <span class="mobile-route-step-copy">
                  <strong>{{ point.label }}</strong>
                  <em>{{ index > 0 ? `${formatDistance(stepMeters(index))} · ${stepBearing(index)}` : "当前位置" }}</em>
                </span>
              </div>
            </div>

            <a-button danger block @click="endNavigation">
              <X :size="14" />结束导航
            </a-button>
          </template>
        </template>
      </template>
    </div>

    <a-drawer
      :open="Boolean(activeSpot)"
      placement="bottom"
      height="74vh"
      title="拍照机位"
      class="mobile-bottom-drawer"
      @close="activeSpot = null"
    >
      <div v-if="activeSpot" class="mobile-spot-detail">
        <div class="mobile-spot-detail-title">
          <strong>{{ activeSpot.name }}</strong>
          <span>{{ activeSpot.code }}</span>
        </div>
        <div class="mobile-info-row"><span>编号</span><strong>{{ activeSpot.code }}</strong></div>
        <div class="mobile-info-row"><span>名称</span><strong>{{ activeSpot.name }}</strong></div>
        <div class="mobile-drawer-label">描述</div>
        <p class="mobile-drawer-copy">{{ activeSpot.description }}</p>
        <div class="mobile-drawer-label">出片建议</div>
        <p class="mobile-drawer-copy mobile-spot-suggestion">{{ activeSpot.suggestion }}</p>
        <div class="mobile-action-row">
          <a-button :type="isPhotoSpotSelected(activeSpot) ? 'default' : 'primary'" @click="togglePhotoSpotSelection(activeSpot)">
            {{ isPhotoSpotSelected(activeSpot) ? "移除途经点" : "选为途经点" }}
          </a-button>
          <a-button :type="isPhotoSpotDestination(activeSpot) ? 'default' : 'primary'" @click="chooseSpotDestination(activeSpot)">
            {{ isPhotoSpotDestination(activeSpot) ? "取消终点" : "设为终点" }}
          </a-button>
        </div>
      </div>
    </a-drawer>
  </div>
</template>
