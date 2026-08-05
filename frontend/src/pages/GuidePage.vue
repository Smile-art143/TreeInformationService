<script setup>
import { inject } from "vue";
import ArcGISTreeMap from "../components/ArcGISTreeMap.vue";
import GuideSection from "../components/GuideSection.vue";

const { trees, speciesColors, selectedTree, setSelectedTree, focusTree } = inject("appState");

const onTreeSelect = (tree) => {
  setSelectedTree(tree);
};
</script>

<template>
  <div class="guide-page">
    <!-- 地图区域 —— 与 MapPage 共享同一 ArcGISTreeMap 组件 -->
    <div class="guide-map-area">
      <ArcGISTreeMap
        :trees="trees"
        :selected-tree="selectedTree"
        :species-colors="speciesColors"
        @tree-select="onTreeSelect"
      />
    </div>

    <!-- 导览内容区域 -->
    <div class="guide-content-wrap">
      <GuideSection :trees="trees" @focus-tree="focusTree" />
    </div>
  </div>
</template>
