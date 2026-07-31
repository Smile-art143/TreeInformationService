<script setup>
import { ref, shallowRef, markRaw, watch, onMounted, onUnmounted } from "vue";
import ArcGISMap from "@arcgis/core/Map";
import MapView from "@arcgis/core/views/MapView";
import Graphic from "@arcgis/core/Graphic";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Point from "@arcgis/core/geometry/Point";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol";
import { getDbhSize } from "../api/mockApi";

const props = defineProps({
  trees: { type: Array, default: () => [] },
  selectedTree: { type: Object, default: null },
  speciesColors: { type: Object, default: () => ({}) },
});

const emit = defineEmits(["treeSelect"]);

const containerRef = ref(null);
const viewRef = shallowRef(null);
const layerRef = shallowRef(null);
const treesRef = ref([...props.trees]);

// Keep treesRef in sync
watch(() => props.trees, (val) => {
  treesRef.value = val;
});

// Initialize ArcGIS map view
onMounted(() => {
  if (!containerRef.value || viewRef.value) return;

  const treeLayer = new GraphicsLayer({ title: "树木点位" });
  const map = new ArcGISMap({
    layers: [treeLayer],
  });

  const view = new MapView({
    container: containerRef.value,
    map,
    center: [108.9391, 34.2286],
    zoom: 18,
    constraints: {
      minZoom: 14,
    },
    popupEnabled: false,
  });

  view.ui.move("zoom", "bottom-right");
  viewRef.value = markRaw(view);
  layerRef.value = markRaw(treeLayer);

  const clickHandle = view.on("click", async (event) => {
    const response = await view.hitTest(event);
    const hit = response.results.find((item) => {
      return "graphic" in item && item.graphic?.layer === treeLayer;
    });

    if (hit && "graphic" in hit) {
      const treeId = hit.graphic.attributes?.treeId;
      const tree = treesRef.value.find((item) => item.id === treeId);
      if (tree) emit("treeSelect", tree);
    }
  });

  // Cleanup on unmount
  onUnmounted(() => {
    clickHandle.remove();
    view.destroy();
    viewRef.value = null;
    layerRef.value = null;
  });
});

// Update graphics when trees/filters change
watch(
  () => [props.trees, props.selectedTree, props.speciesColors],
  () => {
    const layer = layerRef.value;
    if (!layer) return;

    layer.removeAll();
    const graphics = props.trees.map((tree) => {
      const isSelected = props.selectedTree?.id === tree.id;
      const symbol = new SimpleMarkerSymbol({
        style: "circle",
        color: props.speciesColors[tree.species] ?? "#4B7F52",
        size: getDbhSize(tree.dbh) + (isSelected ? 5 : 0),
        outline: {
          color: isSelected ? "#17251A" : "#ffffff",
          width: isSelected ? 2.5 : 1,
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
</script>

<template>
  <div class="map-canvas" ref="containerRef"></div>
</template>
