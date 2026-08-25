<script setup>
import { computed, inject, ref } from "vue";
import { message } from "ant-design-vue";
import { Camera, CheckCircle2, MapPin, Navigation, Route as RouteIcon, Trees, X } from "lucide-vue-next";
import ArcGISTreeMap from "./ArcGISTreeMap.vue";
import { bearingToText, calculateBearing, haversineDistance } from "../api/mockApi";
import { planVisitorRoute } from "../api/routePlanner";
import {
  fetchPhotoSpots,
  fetchSeasonalWindows,
  fetchWindowTrees,
  resolvePark,
} from "../api/routesApi";
import { getSeasonalRoutePreset } from "../data/seasonalRoutes";

const app = inject("appState");
const { trees, speciesColors } = app;

const mapRef = ref(null);
const business = ref(null);
const isLocating = ref(false);
const currentPosition = ref(null);
const matchedPark = ref(null);
const selectedWindow = ref(null);
const selectedPhotoSpotIds = ref([]);
const activeSpot = ref(null);
const showPhotoSpotPicker = ref(false);
const isPickingPosition = ref(false);
const photoDestinationId = ref(null);
const seasonalDestinationPoint = ref(null);
const navigationActive = ref(false);
const routeOrder = ref([]);
const routeTotalMeters = ref(0);
const routePolylines = ref([]);
const isPlanningRoute = ref(false);
const routeDurationSeconds = ref(0);
const routePanelCollapsed = ref(false);
const seasonalPickedPoints = ref([]);
const routeSource = ref("straight");

const windowTrees = ref([]);
const highlightedTreeIds = computed(() => windowTrees.value.map((tree) => tree.id));
const photoSpotsForPark = ref([]);
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
    return point ? { lat: point.lat, lng: point.lng, name: point.name || "窗口终点" } : null;
  }
  return null;
});
const destinationLabel = computed(() => destination.value?.name || "未选择");
const routeDurationMinutes = computed(() =>
  routeDurationSeconds.value
    ? Math.max(1, Math.round(routeDurationSeconds.value / 60))
    : Math.max(1, Math.round(routeTotalMeters.value / 80))
);
const routeSourceLabel = computed(() => {
  if (routeSource.value === "local") return "本地路网步行路线 · 实时路径";
  return "直线距离估算";
});
const businessTitle = computed(() => (business.value === "photo" ? "拍照机位路线" : "季节主题路线"));
function openSeasonalRoute() {
  business.value = "seasonal";
  routePanelCollapsed.value = false;
  resetRouteState();
  locateVisitor();
}

function openPhotoRoute() {
  business.value = "photo";
  routePanelCollapsed.value = false;
  resetRouteState();
  locateVisitor();
}

function backToBusiness() {
  business.value = null;
  routePanelCollapsed.value = false;
  resetRouteState();
}

function resetRouteState() {
  selectedWindow.value = null;
  windowTrees.value = [];
  selectedPhotoSpotIds.value = [];
  activeSpot.value = null;
  showPhotoSpotPicker.value = false;
  photoDestinationId.value = null;
  seasonalDestinationPoint.value = null;
  seasonalPickedPoints.value = [];
  isPickingPosition.value = false;
  navigationActive.value = false;
  routeOrder.value = [];
  routeTotalMeters.value = 0;
  routePolylines.value = [];
  isPlanningRoute.value = false;
  routeDurationSeconds.value = 0;
  routeSource.value = "straight";
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

async function resolveMatchedPark() {
  const pos = currentPosition.value;
  const park = await resolvePark(pos.lng, pos.lat);
  matchedPark.value = park;
  resetRouteState();
  if (park) {
    photoSpotsForPark.value = await fetchPhotoSpots(park.id);
    const windows = await fetchSeasonalWindows(park.id);
    matchedPark.value = { ...park, windows };
    message.success(`已识别${park.siteName}路线方案`);
  } else {
    photoSpotsForPark.value = [];
    message.info("当前位置不在已开通路线的景区缓冲区内");
  }
}

async function selectWindow(window) {
  if (!matchedPark.value) return;
  selectedWindow.value = window;
  const preset = getSeasonalRoutePreset(matchedPark.value.id, window.key);
  seasonalPickedPoints.value = preset?.waypoints || [];
  navigationActive.value = false;
  routeOrder.value = [];
  routeTotalMeters.value = 0;
  routePolylines.value = [];
  routeDurationSeconds.value = 0;
  clearMapOverlays();
  const data = await fetchWindowTrees(matchedPark.value.id, window.key);
  windowTrees.value = data.trees || [];
  seasonalDestinationPoint.value = preset?.destination
    ? {
        lat: preset.destination.latitude,
        lng: preset.destination.longitude,
        name: preset.destination.name,
      }
    : null;
  const center = getCenter(seasonalPickedPoints.value.length ? seasonalPickedPoints.value : windowTrees.value);
  mapRef.value?.flyTo(center.lat, center.lng, 18);
  message.success(`已加载${window.label}路线预设`);
}

function clearMapOverlays() {
  mapRef.value?.clearCustomOverlays();
}

function redrawRouteOverlays() {
  const map = mapRef.value;
  if (!map) return;
  map.clearCustomOverlays();
  const routeNodes = [];
  if (currentPosition.value) {
    routeNodes.push({ ...currentPosition.value, type: "start", label: "起" });
  }
  if (destination.value) {
    routeNodes.push({ ...destination.value, type: "destination", label: "终" });
  }
  map.showRouteNodes(routeNodes);
}

function handleMapClick({ latitude, longitude }) {
  if (!isPickingPosition.value) return;
  currentPosition.value = { lat: latitude, lng: longitude };
  isPickingPosition.value = false;
  resolveMatchedPark();
}

function handleTreeSelect(tree) {
  if (!tree) return;
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
    redrawRouteOverlays();
    return;
  }
  photoDestinationId.value = spot.id;
  selectedPhotoSpotIds.value = selectedPhotoSpotIds.value.filter((id) => id !== spot.id);
  redrawRouteOverlays();
  message.success("终点已选择，可开始导航");
}

function startMapPositionPick() {
  isPickingPosition.value = true;
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
    message.info(business.value === "seasonal" ? "该观赏窗口暂无可规划终点" : "请先选择一个机位作为终点");
    return;
  }

  const seasonalPreset =
    business.value === "seasonal"
      ? getSeasonalRoutePreset(matchedPark.value.id, selectedWindow.value.key)
      : null;
  let waypoints =
    business.value === "photo"
      ? selectedPhotoSpots.value.filter((spot) => spot.id !== photoDestinationId.value)
      : seasonalPreset?.waypoints || [];
  const routeDestination =
    business.value === "seasonal" && seasonalPreset?.destination
      ? {
          lat: seasonalPreset.destination.latitude,
          lng: seasonalPreset.destination.longitude,
          name: seasonalPreset.destination.name,
        }
      : destination.value;
  const ordered = planShortestPath(currentPosition.value, waypoints, routeDestination);
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
  routeSource.value = "straight";
  routePolylines.value = [];
  routeDurationSeconds.value = 0;

  isPlanningRoute.value = true;
  try {
    const photoStops =
      business.value === "photo"
        ? selectedPhotoSpots.value
            .filter((spot) => spot.id !== photoDestinationId.value)
            .map((spot) => ({
              ...spot,
              stop_id: spot.id,
              stop_name: spot.name,
            }))
        : [];
    const result = await planVisitorRoute({
      park: matchedPark.value.id,
      scenario: business.value === "photo" ? "photo_route" : "season_route",
      origin: currentPosition.value,
      destination: destination.value,
      stops: photoStops,
      viewingWindowId:
        business.value === "seasonal" ? selectedWindow.value.key : undefined,
      orderedPoints: ordered,
    });
    routeSource.value = result.source;
    routeTotalMeters.value = result.totalMeters;
    routeDurationSeconds.value = result.durationSeconds;
    routePolylines.value = result.source === "straight" ? [] : result.polylines;
    routeOrder.value = ordered;
  } catch (error) {
    routeSource.value = "straight";
    routePolylines.value = [];
    message.warning("路线规划失败，已用直线距离估算");
  } finally {
    isPlanningRoute.value = false;
  }

  navigationActive.value = true;
  drawNavigationRoute();
  message.success(`已规划 ${waypoints.length} 个途经点的路线`);
}

function planShortestPath(start, waypoints, end) {
  const remaining = waypoints.map((item) => ({
    lat: Number(item.latitude ?? item.lat),
    lng: Number(item.longitude ?? item.lng),
    label: item.label || item.name || (item.code ? `${item.code} / ${item.name || item.species}` : "途经点"),
    id: item.id || item.treeId || "waypoint",
  }));
  const ordered = [{ ...start, id: "origin", label: "当前位置", type: "start" }];
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

  ordered.push({ ...end, id: end.id || "dest", label: end.name || "终点", type: "destination" });
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

  if (routeSource.value !== "straight" && routePolylines.value.length > 0) {
    routePolylines.value.forEach((polyline) => map.showRoutePolyline(polyline));
  } else {
    for (let i = 0; i < routeOrder.value.length - 1; i++) {
      const from = routeOrder.value[i];
      const to = routeOrder.value[i + 1];
      map.showNavigationLine(from.lat, from.lng, to.lat, to.lng);
    }
  }
  map.showRouteNodes(routeOrder.value.map((point, index) => ({
    lat: point.lat,
    lng: point.lng,
    type: index === 0 ? "start" : index === routeOrder.value.length - 1 ? "destination" : "waypoint",
    label: index === 0 ? "起" : index === routeOrder.value.length - 1 ? "终" : String(index),
  })));

  const center = getCenter(routeOrder.value);
  map.flyTo(center.lat, center.lng, 16);
}

function endNavigation() {
  navigationActive.value = false;
  routeOrder.value = [];
  routeTotalMeters.value = 0;
  routePolylines.value = [];
  routeSource.value = "straight";
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
        :photo-spot-destination-id="photoDestinationId"
        compact
        @tree-select="handleTreeSelect"
        @map-click="handleMapClick"
        @photo-spot-select="handlePhotoSpotSelect"
      />
    </div>

    <div
      class="mobile-route-panel"
      :class="{
        'has-route-detail': business !== null,
        'is-collapsed': business !== null && routePanelCollapsed,
      }"
    >
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
          <span class="mobile-route-heading-actions">
            <button type="button" class="mobile-route-back" @click="routePanelCollapsed = !routePanelCollapsed">
              {{ routePanelCollapsed ? '展开' : '收起' }}
            </button>
            <button type="button" class="mobile-route-back" @click="backToBusiness">返回</button>
          </span>
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
            </template>
          </template>

          <template v-else-if="business === 'photo'">
            <p v-if="photoSpotsForPark.length === 0" class="mobile-route-copy">该景区暂无机位数据。</p>
            <button v-else type="button" class="mobile-photo-picker-entry" @click="showPhotoSpotPicker = true">
              <span class="mobile-photo-picker-entry-icon"><Camera :size="19" /></span>
              <span>
                <strong>选择拍照机位</strong>
                <em>在独立页面浏览 {{ photoSpotsForPark.length }} 个推荐机位</em>
              </span>
              <span class="mobile-photo-picker-entry-count">已选 {{ selectedPhotoSpotIds.length }} 个</span>
            </button>
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
              {{ routeSourceLabel }}
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
      :open="showPhotoSpotPicker"
      placement="bottom"
      height="88dvh"
      title="选择拍照机位"
      class="mobile-bottom-drawer mobile-photo-picker-drawer"
      @close="showPhotoSpotPicker = false"
    >
      <div class="mobile-photo-picker-shell">
        <div class="mobile-photo-picker-intro">
          <span><MapPin :size="14" />{{ matchedPark?.siteName || '当前景区' }}</span>
          <strong>{{ photoSpotsForPark.length }} 个推荐机位</strong>
        </div>

        <div class="mobile-spot-list mobile-photo-picker-list">
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

        <div class="mobile-photo-picker-footer">
          <span>
            <em>已选机位</em>
            <strong>{{ selectedPhotoSpotIds.length }} 个</strong>
          </span>
          <span>
            <em>终点</em>
            <strong>{{ destinationLabel }}</strong>
          </span>
          <a-button type="primary" block @click="showPhotoSpotPicker = false">完成选择</a-button>
        </div>
      </div>
    </a-drawer>

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
