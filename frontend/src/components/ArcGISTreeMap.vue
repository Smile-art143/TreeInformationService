<script setup>
import { ref, shallowRef, markRaw, watch, onMounted, onUnmounted } from "vue";
import ArcGISMap from "@arcgis/core/Map";
import MapView from "@arcgis/core/views/MapView";
import Graphic from "@arcgis/core/Graphic";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Point from "@arcgis/core/geometry/Point";
import Polygon from "@arcgis/core/geometry/Polygon";
import Polyline from "@arcgis/core/geometry/Polyline";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol";
import SimpleLineSymbol from "@arcgis/core/symbols/SimpleLineSymbol";
import { getDbhSize } from "../api/mockApi";
import { createTiandituBaseLayers } from "../map/tiandituLayers";

const props = defineProps({
  trees: { type: Array, default: () => [] },
  selectedTree: { type: Object, default: null },
  speciesColors: { type: Object, default: () => ({}) },
  highlightedTreeIds: { type: Array, default: () => [] },
  photoSpots: { type: Array, default: () => [] },
  selectedPhotoSpotIds: { type: Array, default: () => [] },
  compact: { type: Boolean, default: false },
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

  const [vecLayer, cvaLayer] = createTiandituBaseLayers();

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
      maxZoom: 18,
    },
    popupEnabled: false,
  });

  view.ui.move("zoom", "bottom-right");
  viewRef.value = markRaw(view);
  layerRef.value = markRaw(treeLayer);
  photoSpotLayerRef.value = markRaw(photoSpotLayer);
  overlayLayerRef.value = markRaw(overlayLayer);

  // Draw the initial tree / photo-spot points right away, so the basemap
  // shows all points on entry instead of waiting for a filter/select change.
  renderTrees();
  renderPhotoSpots();

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

// Render tree point graphics onto the tree layer
function renderTrees() {
  const layer = layerRef.value;
  if (!layer) return;

  layer.removeAll();
  const graphics = props.trees.map((tree) => {
    const isSelected = props.selectedTree?.id === tree.id;
    const isHighlighted = props.highlightedTreeIds.includes(tree.id);
    const baseSize = getDbhSize(tree.dbh);
    const markerSize = props.compact ? Math.max(5, Math.round(baseSize * 0.68)) : baseSize;
    const symbol = new SimpleMarkerSymbol({
      style: "circle",
      color: props.speciesColors[tree.species] ?? "#4B7F52",
      size: markerSize + (isSelected ? 7 : 0) + (isHighlighted ? (props.compact ? 1 : 4) : 0),
      outline: {
        color: isSelected ? "#F2B134" : isHighlighted ? "#17251A" : "#ffffff",
        width: isSelected ? 3 : isHighlighted ? (props.compact ? 1.5 : 2) : 1,
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
}

// Render photo spot markers onto the photo spot layer
function renderPhotoSpots() {
  const layer = photoSpotLayerRef.value;
  if (!layer) return;

  layer.removeAll();
  const graphics = props.photoSpots.flatMap((spot) => {
    const isSelected = props.selectedPhotoSpotIds.includes(spot.id);
    const color = isSelected ? [242, 177, 52, 1] : [230, 106, 44, 0.95];
    const size = props.compact ? (isSelected ? 13 : 10) : (isSelected ? 20 : 16);
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
          outline: { color: "#ffffff", width: props.compact ? 1.5 : (isSelected ? 3 : 2) },
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
          size: props.compact ? (isSelected ? 4 : 3) : (isSelected ? 7 : 5),
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
}

// Update graphics when trees/filters change
watch(
  () => [props.trees, props.selectedTree, props.speciesColors, props.highlightedTreeIds, props.compact],
  renderTrees,
  { deep: true }
);

// Update photo spot markers
watch(
  () => [props.photoSpots, props.selectedPhotoSpotIds, props.compact],
  renderPhotoSpots,
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
    if (props.compact) {
      layer.add(new Graphic({
        geometry: new Point({ longitude: lng, latitude: lat }),
        symbol: new SimpleMarkerSymbol({
          style: "circle",
          color: [80, 128, 44, 1],
          size: 11,
          outline: { color: [255, 255, 255, 1], width: 2 },
        }),
        attributes: { type: "location-marker" },
      }));
      return;
    }
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
    if (props.compact) {
      const isDestination = statusType === "destination";
      const isWaypoint = statusType === "waypoint" || statusType === "picked-waypoint";
      const isWorkOrder = statusType === "processing" || statusType === "reviewing";
      const color = isDestination
        ? [143, 31, 36, 1]
        : isWaypoint
          ? [80, 128, 44, 0.92]
          : statusType === "processing"
            ? [214, 98, 38, 1]
            : [113, 61, 143, 1];
      if (isWorkOrder) {
        layer.add(new Graphic({
          geometry: new Point({ longitude: lng, latitude: lat }),
          symbol: new SimpleMarkerSymbol({
            style: "circle",
            color: [242, 177, 52, 0.2],
            size: 23,
            outline: { color: [242, 177, 52, 0.95], width: 2 },
          }),
          attributes: { type: "target-marker-halo", statusType },
        }));
      }
      layer.add(new Graphic({
        geometry: new Point({ longitude: lng, latitude: lat }),
        symbol: new SimpleMarkerSymbol({
          style: isDestination ? "diamond" : "circle",
          color,
          size: isWorkOrder ? 14 : isDestination ? 12 : 6,
          outline: { color: [255, 255, 255, 1], width: isWaypoint ? 1 : 2 },
        }),
        attributes: { type: "target-marker", statusType },
      }));
      return;
    }
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
        width: props.compact ? 2 : 3,
        style: "dash",
      }),
      attributes: { type: "navigation-line" },
    }));
  },
  showRoutePolyline(points) {
    const layer = overlayLayerRef.value;
    if (!layer || !points || points.length < 2) return;
    layer.add(new Graphic({
      geometry: new Polyline({
        paths: [points],
        spatialReference: { wkid: 4326 },
      }),
      symbol: new SimpleLineSymbol({
        color: [22, 119, 255, 0.9],
        width: props.compact ? 3 : 5,
        style: "solid",
        cap: "round",
        join: "round",
      }),
      attributes: { type: "amap-route" },
    }));
  },
});
</script>

<template>
  <div class="map-canvas" ref="containerRef"></div>
</template>
