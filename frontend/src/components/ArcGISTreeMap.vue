<script setup>
import { ref, shallowRef, markRaw, watch, onMounted, onUnmounted } from "vue";
import ArcGISMap from "@arcgis/core/Map";
import MapView from "@arcgis/core/views/MapView";
import Graphic from "@arcgis/core/Graphic";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import WebTileLayer from "@arcgis/core/layers/WebTileLayer";
import Point from "@arcgis/core/geometry/Point";
import Polygon from "@arcgis/core/geometry/Polygon";
import Polyline from "@arcgis/core/geometry/Polyline";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol";
import SimpleLineSymbol from "@arcgis/core/symbols/SimpleLineSymbol";
import { getDbhSize } from "../api/mockApi";




// ============================================================
// 天地图密钥 —— 请前往 https://console.tianditu.gov.cn/ 申请后填入
// ============================================================
const TIANDITU_KEY = "68e3b341681f835b6664c94010c6896a";

// --------------------------------------------------
// 使用 createSubclass 确保 LayerView 可被 ArcGIS 正常创建
// --------------------------------------------------
const ThrottledWebTileLayer = WebTileLayer.createSubclass({
  constructor() {
    this._pendingQueue = [];
    this._activeCount = 0;
    this._maxConcurrent = 6; // 最多 6 个并发瓦片请求
  },

  fetchTile(level, row, col, options) {
    const self = this;
    return new Promise((resolve) => {
      const doFetch = () => {
        self._activeCount++;
        // 调用原始 WebTileLayer 的 fetchTile
        const baseFetch = WebTileLayer.prototype.fetchTile.call(self, level, row, col, options);
        baseFetch.then(
          (tile) => {
            self._activeCount--;
            self._processQueue();
            resolve(tile);
          },
          () => {
            // 请求失败（含 429）→ 1-3s 随机延迟后重试
            const delay = 1000 + Math.random() * 2000;
            self._activeCount--;
            setTimeout(() => {
              self._processQueue();
              self._enqueue(doFetch);
            }, delay);
          }
        );
      };
      self._enqueue(doFetch);
    });
  },

  _enqueue(fn) {
    if (this._activeCount < this._maxConcurrent) {
      fn();
    } else {
      this._pendingQueue.push(fn);
    }
  },

  _processQueue() {
    while (this._activeCount < this._maxConcurrent && this._pendingQueue.length) {
      this._pendingQueue.shift()();
    }
  },
});

const props = defineProps({
  trees: { type: Array, default: () => [] },
  selectedTree: { type: Object, default: null },
  speciesColors: { type: Object, default: () => ({}) },
  highlightedTreeIds: { type: Array, default: () => [] },
  photoSpots: { type: Array, default: () => [] },
  selectedPhotoSpotIds: { type: Array, default: () => [] },
});

const emit = defineEmits(["treeSelect", "mapClick", "photoSpotSelect"]);

const containerRef = ref(null);
const viewRef = shallowRef(null);
const layerRef = shallowRef(null);
const photoSpotLayerRef = shallowRef(null);
const overlayLayerRef = shallowRef(null);
const treesRef = ref([...props.trees]);

// Keep treesRef in sync
watch(() => props.trees, (val) => {
  treesRef.value = val;
});

// Initialize ArcGIS map view
onMounted(() => {
  if (!containerRef.value || viewRef.value) return;

  const treeLayer = new GraphicsLayer({ title: "树木点位" });
  const photoSpotLayer = new GraphicsLayer({ title: "拍照机位" });
  const overlayLayer = new GraphicsLayer({ title: "巡检覆盖层" });

  // 天地图矢量底图（限流 + 自动重试）
  const vecLayer = new ThrottledWebTileLayer({
    title: "天地图矢量底图",
    urlTemplate: `https://{subDomain}.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={level}&TILEROW={row}&TILECOL={col}&tk=${TIANDITU_KEY}`,
    subDomains: ["t0", "t1", "t2", "t3"],
  });

  // 天地图矢量注记——中文标注（限流 + 自动重试）
  const cvaLayer = new ThrottledWebTileLayer({
    title: "天地图矢量注记",
    urlTemplate: `https://{subDomain}.tianditu.gov.cn/cva_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cva&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={level}&TILEROW={row}&TILECOL={col}&tk=${TIANDITU_KEY}`,
    subDomains: ["t0", "t1", "t2", "t3"],
  });

  const map = new ArcGISMap({
    layers: [vecLayer, cvaLayer, treeLayer, photoSpotLayer, overlayLayer],
  });

  const view = new MapView({
    container: containerRef.value,
    map,
    center: [108.9391, 34.2286],
    zoom: 18,
    constraints: {
      minZoom: 14,
      maxZoom: 19,
    },
    popupEnabled: false,
  });

  view.ui.move("zoom", "bottom-right");
  viewRef.value = markRaw(view);
  layerRef.value = markRaw(treeLayer);
  photoSpotLayerRef.value = markRaw(photoSpotLayer);
  overlayLayerRef.value = markRaw(overlayLayer);

  const clickHandle = view.on("click", async (event) => {
    const response = await view.hitTest(event);
    const photoSpotHit = response.results.find((item) => {
      return "graphic" in item && item.graphic?.layer === photoSpotLayer;
    });
    if (photoSpotHit && "graphic" in photoSpotHit) {
      const spotId = photoSpotHit.graphic.attributes?.photoSpotId;
      const spot = props.photoSpots.find((item) => item.id === spotId);
      if (spot) emit("photoSpotSelect", spot);
      return;
    }

    const hit = response.results.find((item) => {
      return "graphic" in item && item.graphic?.layer === treeLayer;
    });

    if (hit && "graphic" in hit) {
      const treeId = hit.graphic.attributes?.treeId;
      const tree = treesRef.value.find((item) => item.id === treeId);
      if (tree) emit("treeSelect", tree);
    } else {
      // Clicked on empty map space → emit coordinates for repositioning
      emit("mapClick", {
        longitude: event.mapPoint.longitude,
        latitude: event.mapPoint.latitude,
      });
    }
  });

  // Cleanup on unmount
  onUnmounted(() => {
    clickHandle.remove();
    view.destroy();
    viewRef.value = null;
    layerRef.value = null;
    photoSpotLayerRef.value = null;
    overlayLayerRef.value = null;
  });
});

// Update graphics when trees/filters change
watch(
  () => [props.trees, props.selectedTree, props.speciesColors, props.highlightedTreeIds],
  () => {
    const layer = layerRef.value;
    if (!layer) return;

    layer.removeAll();
    const graphics = props.trees.map((tree) => {
      const isSelected = props.selectedTree?.id === tree.id;
      const isHighlighted = props.highlightedTreeIds.includes(tree.id);
      const symbol = new SimpleMarkerSymbol({
        style: "circle",
        color: props.speciesColors[tree.species] ?? "#4B7F52",
        size: getDbhSize(tree.dbh) + (isSelected ? 5 : 0) + (isHighlighted ? 7 : 0),
        outline: {
          color: isSelected ? "#17251A" : isHighlighted ? "#F2B134" : "#ffffff",
          width: isSelected || isHighlighted ? 2.5 : 1,
        },
      });

      return new Graphic({
        geometry: new Point({
          longitude: tree.longitude,
          latitude: tree.latitude,
        }),
        symbol,
        attributes: {
          treeId: tree.id,
          species: tree.species,
          dbh: tree.dbh,
        },
      });
    });

    layer.addMany(graphics);
  },
  { deep: true }
);

// Update photo spot markers
watch(
  () => [props.photoSpots, props.selectedPhotoSpotIds],
  () => {
    const layer = photoSpotLayerRef.value;
    if (!layer) return;

    layer.removeAll();
    const graphics = props.photoSpots.flatMap((spot) => {
      const isSelected = props.selectedPhotoSpotIds.includes(spot.id);
      const color = isSelected ? [242, 177, 52, 1] : [230, 106, 44, 0.95];
      const size = isSelected ? 20 : 16;
      return [
        new Graphic({
          geometry: new Point({
            longitude: spot.longitude,
            latitude: spot.latitude,
          }),
          symbol: new SimpleMarkerSymbol({
            style: "diamond",
            color,
            size,
            outline: { color: "#ffffff", width: isSelected ? 3 : 2 },
          }),
          attributes: {
            photoSpotId: spot.id,
            name: spot.name,
            type: "photo-spot",
          },
        }),
        new Graphic({
          geometry: new Point({
            longitude: spot.longitude,
            latitude: spot.latitude,
          }),
          symbol: new SimpleMarkerSymbol({
            style: "circle",
            color: [255, 255, 255, 1],
            size: isSelected ? 7 : 5,
          }),
          attributes: {
            photoSpotId: spot.id,
            name: spot.name,
            type: "photo-spot-core",
          },
        }),
      ];
    });

    layer.addMany(graphics);
  },
  { deep: true }
);

// Pan to selected tree
watch(
  () => props.selectedTree,
  (tree) => {
    const view = viewRef.value;
    if (!view || !tree) return;

    view.goTo(
      {
        center: [tree.longitude, tree.latitude],
        zoom: Math.max(view.zoom, 18),
      },
      { duration: 450 }
    ).catch(() => undefined);
  }
);

// ---- helper: create circle polygon ----
function createCircleGeometry(centerLon, centerLat, radiusM, pointCount = 64) {
  const earthRadius = 6371000;
  const points = [];
  const latRad = (centerLat * Math.PI) / 180;
  const cosLat = Math.cos(latRad);
  for (let i = 0; i <= pointCount; i++) {
    const angle = (i / pointCount) * 2 * Math.PI;
    const dLat = (radiusM * Math.cos(angle)) / earthRadius;
    const dLon = (radiusM * Math.sin(angle)) / (earthRadius * cosLat);
    const lat = centerLat + (dLat * 180) / Math.PI;
    const lon = centerLon + (dLon * 180) / Math.PI;
    points.push([lon, lat]);
  }
  return new Polygon({
    rings: [points],
    spatialReference: { wkid: 4326 },
  });
}

// ---- expose methods for external control ----
defineExpose({
  flyTo(lat, lng, zoom = 18) {
    const view = viewRef.value;
    if (!view) return;
    view.goTo({ center: [lng, lat], zoom }, { duration: 600 });
  },
  showLocationMarker(lat, lng) {
    const layer = overlayLayerRef.value;
    if (!layer) return;
    // White outer ring with blue border
    layer.add(new Graphic({
      geometry: new Point({ longitude: lng, latitude: lat }),
      symbol: new SimpleMarkerSymbol({
        style: "circle",
        color: [255, 255, 255, 1],
        size: 18,
        outline: { color: [22, 119, 255, 1], width: 3 },
      }),
      attributes: { type: "location-marker" },
    }));
    // Crosshair center
    layer.add(new Graphic({
      geometry: new Point({ longitude: lng, latitude: lat }),
      symbol: new SimpleMarkerSymbol({
        style: "cross",
        color: [22, 119, 255, 1],
        size: 12,
      }),
      attributes: { type: "location-marker" },
    }));
  },
  showRadiusCircle(lat, lng, radiusM) {
    const layer = overlayLayerRef.value;
    if (!layer) return;
    layer.add(new Graphic({
      geometry: createCircleGeometry(lng, lat, radiusM),
      symbol: new SimpleFillSymbol({
        color: [22, 119, 255, 0.08],
        outline: new SimpleLineSymbol({
          color: [22, 119, 255, 1],
          width: 1.5,
          style: "dash",
        }),
      }),
      attributes: { type: "radius-circle" },
    }));
  },
  showNearbyHighlight(nearbyTrees) {
    const layer = overlayLayerRef.value;
    if (!layer) return;
    nearbyTrees.forEach((tree) => {
      layer.add(new Graphic({
        geometry: new Point({
          longitude: tree.longitude,
          latitude: tree.latitude,
        }),
        symbol: new SimpleMarkerSymbol({
          style: "circle",
          color: [22, 119, 255, 0.2],
          size: getDbhSize(tree.dbh) + 12,
        }),
        attributes: { type: "nearby-highlight", treeId: tree.id },
      }));
    });
  },
  clearCustomOverlays() {
    const layer = overlayLayerRef.value;
    if (!layer) return;
    layer.removeAll();
  },
  showPendingTreeMarkers(pendingTrees, statusType) {
    const layer = overlayLayerRef.value;
    if (!layer) return;
    const isProcessing = statusType === "processing";
    const fillColor = isProcessing ? [255, 140, 0, 0.7] : [153, 51, 255, 0.7];
    const outlineColor = isProcessing ? [255, 120, 0, 1] : [130, 30, 230, 1];
    pendingTrees.forEach((tree) => {
      layer.add(new Graphic({
        geometry: new Point({
          longitude: tree.longitude,
          latitude: tree.latitude,
        }),
        symbol: new SimpleMarkerSymbol({
          style: "circle",
          color: fillColor,
          size: getDbhSize(tree.dbh) + 6,
          outline: { color: outlineColor, width: 2 },
        }),
        attributes: { type: "pending-tree", treeId: tree.id, statusType },
      }));
    });
  },
  showTargetMarker(lat, lng, statusType, dbh) {
    const layer = overlayLayerRef.value;
    if (!layer) return;
    const isProcessing = statusType === "processing";
    const color = isProcessing ? [255, 100, 0, 1] : [140, 30, 255, 1];
    const size = (dbh ? getDbhSize(dbh) : 14) + 16;
    // Outer pulse ring
    layer.add(new Graphic({
      geometry: new Point({ longitude: lng, latitude: lat }),
      symbol: new SimpleMarkerSymbol({
        style: "circle",
        color: isProcessing ? [255, 140, 0, 0.25] : [153, 51, 255, 0.25],
        size: size + 10,
      }),
      attributes: { type: "target-marker-pulse" },
    }));
    // Main target marker
    layer.add(new Graphic({
      geometry: new Point({ longitude: lng, latitude: lat }),
      symbol: new SimpleMarkerSymbol({
        style: "circle",
        color,
        size,
        outline: { color: [255, 255, 255, 1], width: 4 },
      }),
      attributes: { type: "target-marker", statusType },
    }));
  },
  showNavigationLine(fromLat, fromLng, toLat, toLng) {
    const layer = overlayLayerRef.value;
    if (!layer) return;
    layer.add(new Graphic({
      geometry: new Polyline({
        paths: [[[fromLng, fromLat], [toLng, toLat]]],
        spatialReference: { wkid: 4326 },
      }),
      symbol: new SimpleLineSymbol({
        color: [22, 119, 255, 0.8],
        width: 3,
        style: "dash",
      }),
      attributes: { type: "navigation-line" },
    }));
  },
});
</script>

<template>
  <div class="map-canvas" ref="containerRef"></div>
</template>
