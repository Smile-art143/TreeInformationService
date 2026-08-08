<script setup>
import { ref, computed, inject } from "vue";
import { Camera, Clock3, MapPinned, Route as RouteIcon } from "lucide-vue-next";
import { message } from "ant-design-vue";

const props = defineProps({
  trees: { type: Array, default: () => [] },
});

const emit = defineEmits(["focusTree"]);

const { role } = inject("appState");

const allRoutePresets = [
  {
    id: "photo",
    name: "拍照机位路线",
    season: "全年",
    duration: "35 分钟",
    description: "串联入口、院落和古建边界附近的树木点位，适合快速展示项目地图能力。",
    species: ["银杏", "侧柏", "松树"],
  },
  {
    id: "autumn",
    name: "秋季银杏路线",
    season: "11 月",
    duration: "45 分钟",
    description: "突出银杏叶色和寺院空间氛围，适合游客导览与图鉴打卡。",
    species: ["银杏", "桂花"],
  },
  {
    id: "care",
    name: "养护巡检路线",
    season: "工作日",
    duration: "30 分钟",
    description: "优先串联异常和待观察树木，辅助巡检人员进行现场复核。",
    species: ["侧柏", "竹林", "松树"],
  },
];

const routePresets = computed(() =>
  role.value === "visitor"
    ? allRoutePresets.filter((r) => r.id !== "care")
    : allRoutePresets
);

const selectedRoute = ref(allRoutePresets[0]);

const routeTrees = computed(() => {
  return selectedRoute.value.species
    .flatMap((species) => props.trees.filter((tree) => tree.species === species).slice(0, 2))
    .slice(0, 6);
});
</script>

<template>
  <div class="routes-page">
    <div class="page-heading">
      <div>
        <h1>路线推荐</h1>
        <p>结合树木分布、观赏季节和巡检需求，推荐适合不同场景的游览与工作路线。</p>
      </div>
      <a-button @click="message.info('已展示当前推荐路线')">
        <RouteIcon :size="16" />生成最短路径
      </a-button>
    </div>

    <div class="routes-layout">
      <!-- Route Presets -->
      <a-card title="路线方案" :bordered="false">
        <a-list :data-source="routePresets">
          <template #renderItem="{ item }">
            <a-list-item
              :class="item.id === selectedRoute.id ? 'route-item selected' : 'route-item'"
              @click="selectedRoute = item"
            >
              <a-list-item-meta
                :title="item.name"
                :description="item.description"
              >
                <template #avatar>
                  <MapPinned :size="20" />
                </template>
              </a-list-item-meta>
              <a-space>
                <a-tag>{{ item.season }}</a-tag>
                <a-tag><Clock3 :size="12" />{{ item.duration }}</a-tag>
              </a-space>
            </a-list-item>
          </template>
        </a-list>
      </a-card>

      <!-- Route Details -->
      <a-card :title="selectedRoute.name" :bordered="false">
        <a-steps
          direction="vertical"
          :items="routeTrees.map((tree, index) => ({
            title: `${index + 1}. ${tree.code} / ${tree.species}`,
            description: `${tree.siteName} · 胸径 ${tree.dbh || '未记录'}cm · ${tree.locationDescription}`,
          }))"
        />
        <a-space wrap class="route-actions">
          <a-button
            v-for="tree in routeTrees.slice(0, 3)"
            :key="tree.id"
            @click="emit('focusTree', tree.id)"
          >
            <Camera :size="15" />查看 {{ tree.code }}
          </a-button>
        </a-space>
      </a-card>
    </div>
  </div>
</template>
