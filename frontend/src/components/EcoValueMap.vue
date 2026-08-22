<script setup>
import { markRaw, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import Map from "@arcgis/core/Map";
import MapView from "@arcgis/core/views/MapView";
import Graphic from "@arcgis/core/Graphic";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Extent from "@arcgis/core/geometry/Extent";
import Point from "@arcgis/core/geometry/Point";
import Polygon from "@arcgis/core/geometry/Polygon";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol";
import SimpleLineSymbol from "@arcgis/core/symbols/SimpleLineSymbol";
import { createTiandituBaseLayers } from "../map/tiandituLayers";
import { treeMarkerSize } from "../utils/ecoSymbols";

const props = defineProps({
  trees: { type: Array, default: () => [] },
  grids: { type: Array, default: () => [] },
  symbolScale: { type: Number, default: 100 },
  autoScale: { type: Boolean, default: true },
  speciesColors: { type: Object, default: () => ({}) },
});

const emit = defineEmits(["gridSelect", "treeSelect"]);

const containerRef = ref(null);
const viewRef = shallowRef(null);
const treeLayerRef = shallowRef(null);
const gridLayerRef = shallowRef(null);
const currentZoom = ref(17);

const GRID_COLORS = [
  "#FBF3D0",
  "#F5D56E",
  "#EDA63C",
  "#D96C2F",
  "#8E2C2C",
];

function zoomCompensation() {
  if (!props.autoScale) return 1;
  return Math.max(0.82, Math.min(1.65, 1 + (17 - currentZoom.value) * 0.18));
}

function treeSymbol(tree) {
  const scaledSize = treeMarkerSize(tree.eco?.annualValueYuan) *
    (props.symbolScale / 100) * zoomCompensation();
  return new SimpleMarkerSymbol({
    style: "circle",
    color: props.speciesColors[tree.species] ?? "#4B7F52",
    size: Math.max(6, Math.min(36, scaledSize)),
    outline: {
      color: "#ffffff",
      width: 1,
    },
  });
}

function gridSymbol(level) {
  return new SimpleFillSymbol({
    color: GRID_COLORS[level - 1] ?? GRID_COLORS[GRID_COLORS.length - 1],
    outline: new SimpleLineSymbol({
      color: [255, 255, 255, 0.9],
      width: 1,
    }),
  });
}

function renderTrees() {
  const layer = treeLayerRef.value;
  if (!layer) return;

  layer.removeAll();
  const graphics = props.trees.map((tree) =>
    new Graphic({
      geometry: new Point({
        longitude: tree.longitude,
        latitude: tree.latitude,
      }),
      symbol: treeSymbol(tree),
      attributes: {
        treeId: tree.id,
        species: tree.species,
        dbh: tree.dbh,
        annualValueYuan: tree.eco?.annualValueYuan ?? 0,
      },
    })
  );
  layer.addMany(graphics);
}

function renderGrids() {
  const layer = gridLayerRef.value;
  if (!layer) return;

  layer.removeAll();
  const graphics = props.grids.map((feature) =>
    new Graphic({
      geometry: new Polygon({
        rings: feature.geometry.coordinates,
        spatialReference: { wkid: 4326 },
      }),
      symbol: gridSymbol(feature.properties.level),
      attributes: { ...feature.properties },
    })
  );
  layer.addMany(graphics);
}

async function fitToGrids() {
  const view = viewRef.value;
  if (!view || props.grids.length === 0) return;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  props.grids.forEach((feature) => {
    feature.geometry.coordinates[0].forEach(([x, y]) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });
  });

  const extent = new Extent({
    xmin: minX,
    ymin: minY,
    xmax: maxX,
    ymax: maxY,
    spatialReference: { wkid: 4326 },
  });
  try {
    await view.when();
    await view.goTo(extent.expand(1.12), { duration: 600 });
  } catch {
    // 视图初始化或动画被中断时静默忽略，下一次园区数据更新会再次适配。
  }
}

async function flyTo(latitude, longitude, zoom = 18) {
  const view = viewRef.value;
  if (!view) return;
  try {
    await view.when();
    await view.goTo({ center: [longitude, latitude], zoom }, { duration: 600 });
  } catch {
    // 视图初始化或动画被中断时静默忽略。
  }
}

onMounted(() => {
  if (!containerRef.value || viewRef.value) return;

  const treeLayer = new GraphicsLayer({ title: "生态价值树点" });
  const gridLayer = new GraphicsLayer({ title: "生态价值网格" });
  const [vecLayer, cvaLayer] = createTiandituBaseLayers();
  const map = new Map({
    layers: [vecLayer, cvaLayer, gridLayer, treeLayer],
  });
  const view = new MapView({
    container: containerRef.value,
    map,
    center: [108.95, 34.222],
    zoom: 16,
    constraints: {
      minZoom: 14,
      maxZoom: 19,
    },
    popupEnabled: false,
  });

  view.ui.move("zoom", "bottom-right");
  viewRef.value = markRaw(view);
  treeLayerRef.value = markRaw(treeLayer);
  gridLayerRef.value = markRaw(gridLayer);

  renderTrees();
  renderGrids();
  fitToGrids();

  const stationaryHandle = view.watch("stationary", (stationary) => {
    if (!stationary) return;
    currentZoom.value = view.zoom;
    if (props.autoScale) renderTrees();
  });

  const clickHandle = view.on("click", async (event) => {
    const response = await view.hitTest(event);
    const treeHit = response.results.find(
      (item) =>
        "graphic" in item &&
        (item.graphic?.layer === treeLayer || item.layer === treeLayer)
    );
    if (treeHit && "graphic" in treeHit) {
      emit("treeSelect", { ...treeHit.graphic.attributes });
      return;
    }

    const hit = response.results.find(
      (item) =>
        "graphic" in item &&
        (item.graphic?.layer === gridLayer || item.layer === gridLayer)
    );
    if (hit && "graphic" in hit) {
      emit("gridSelect", { ...hit.graphic.attributes });
    }
  });

  onUnmounted(() => {
    clickHandle.remove();
    stationaryHandle.remove();
    view.destroy();
    viewRef.value = null;
    treeLayerRef.value = null;
    gridLayerRef.value = null;
  });
});

watch(
  [
    () => props.trees,
    () => props.symbolScale,
    () => props.autoScale,
    () => props.speciesColors,
  ],
  renderTrees,
  { deep: false }
);
watch(
  () => props.grids,
  () => {
    renderGrids();
    fitToGrids();
  },
  { deep: false }
);

defineExpose({ flyTo });
</script>

<template>
  <div class="eco-map-canvas" ref="containerRef"></div>
</template>

<style scoped>
.eco-map-canvas {
  width: 100%;
  height: 100%;
  background: #e8f0f2;
}
</style>
