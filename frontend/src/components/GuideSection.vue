<script setup>
import { computed, inject, ref } from "vue";
import { Camera, Heart, MapPin, Navigation, Sparkles } from "lucide-vue-next";
import { message } from "ant-design-vue";
import { findNearbyTrees } from "../api/mockApi";

const props = defineProps({
  trees: { type: Array, default: () => [] },
  role: { type: String, default: "visitor" },
});

const emit = defineEmits(["focusTree", "viewTree"]);

const app = inject("appState");
const { unlockedSpecies, allSpecies } = app || {};

// ---- visitor mode state ----
// 假数据：取前 5 棵树加上模拟距离，方便测试附近树木列表
const nearbyTrees = ref(
  props.trees.slice(0, 5).map((t, i) => ({
    ...t,
    distance: [2.3, 4.8, 6.1, 7.5, 9.2][i] ?? (Math.random() * 8 + 1).toFixed(1),
  }))
);
const isLocating = ref(false);

const locateNearbyTrees = () => {
  isLocating.value = true;
  if (!navigator.geolocation) {
    message.warning("您的浏览器不支持地理定位");
    isLocating.value = false;
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      nearbyTrees.value = findNearbyTrees(props.trees, latitude, longitude, 10);
      isLocating.value = false;
      if (nearbyTrees.value.length === 0) {
        message.info("您周边10米内暂无树木");
      } else {
        message.success(`找到 ${nearbyTrees.value.length} 棵附近树木`);
      }
    },
    (err) => {
      isLocating.value = false;
      if (err.code === 1) {
        message.error("定位权限被拒绝，请在浏览器设置中允许定位");
      } else {
        message.error("获取定位失败，请稍后重试");
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
};

const atlasProgress = computed(() => {
  if (!allSpecies || allSpecies.length === 0) return 0;
  const unlocked = unlockedSpecies || [];
  return Math.round((unlocked.length / allSpecies.length) * 100);
});

// ---- non-visitor fallback ----
const fallbackNearby = props.trees.slice(0, 6);
const fallbackUnlocked = ref(["银杏"]);
const fallbackCheckIn = (tree) => {
  fallbackUnlocked.value = Array.from(new Set([...fallbackUnlocked.value, tree.species]));
  message.success(`已打卡 ${tree.code}，解锁 ${tree.species} 图鉴`);
};
</script>

<template>
  <div>
    <!-- ===== Visitor Mode ===== -->
    <template v-if="role === 'visitor'">
      <div class="page-heading">
        <div>
          <h1>旅游导览</h1>
          <p>定位周边树木，拍照打卡解锁图鉴，探索城市里的每一棵树木。</p>
        </div>
        <a-button :loading="isLocating" @click="locateNearbyTrees">
          <Navigation :size="16" />{{ isLocating ? "定位中…" : "定位附近树木" }}
        </a-button>
      </div>

      <div class="guide-layout">
        <!-- Nearby Trees -->
        <a-card title="附近树木" :bordered="false">
          <div v-if="nearbyTrees.length === 0" class="empty-hint">
            点击上方「定位附近树木」按钮，查看您周边 10 米范围内的树木
          </div>
          <a-list v-else :data-source="nearbyTrees">
            <template #renderItem="{ item: tree }">
              <a-list-item>
                <template #actions>
                  <a-tag color="green">{{ tree.distance }}m</a-tag>
                  <a-button size="small" @click="emit('viewTree', tree)">查看</a-button>
                </template>
                <a-list-item-meta
                  :title="`${tree.code} / ${tree.species}`"
                  :description="`${tree.siteName} · 胸径 ${tree.dbh || '未记录'}cm`"
                >
                  <template #avatar>
                    <span class="mini-tree-dot" />
                  </template>
                </a-list-item-meta>
              </a-list-item>
            </template>
          </a-list>
        </a-card>

        <!-- Tree Atlas -->
        <a-card title="树种图鉴" :bordered="false">
          <div class="atlas-progress">
            <a-progress
              :percent="atlasProgress"
              :format="() => `已解锁 ${(unlockedSpecies || []).length} / ${(allSpecies || []).length} 种`"
              :stroke-color="{ from: '#4B7F52', to: '#2F7D32' }"
            />
          </div>
          <div class="atlas-grid">
            <div
              v-for="species in (allSpecies || [])"
              :key="species"
              :class="(unlockedSpecies || []).includes(species) ? 'atlas-card unlocked' : 'atlas-card'"
            >
              <Sparkles :size="18" />
              <strong>{{ species }}</strong>
              <span>{{ (unlockedSpecies || []).includes(species) ? '已解锁' : '待打卡' }}</span>
            </div>
          </div>
        </a-card>
      </div>
    </template>

    <!-- ===== Non-Visitor Mode (Original) ===== -->
    <template v-else>
      <div class="page-heading">
        <div>
          <h1>旅游导览</h1>
          <p>面向游客的附近树木、拍照打卡、树种图鉴和故事投稿入口。</p>
        </div>
        <a-button @click="emit('focusTree', fallbackNearby[0].id)">
          <Navigation :size="16" />定位附近树木
        </a-button>
      </div>

      <div class="guide-layout">
        <a-card title="附近树木" :bordered="false">
          <a-list :data-source="fallbackNearby">
            <template #renderItem="{ item: tree }">
              <a-list-item>
                <template #actions>
                  <a-button size="small" @click="emit('focusTree', tree.id)">查看</a-button>
                  <a-button size="small" type="primary" @click="fallbackCheckIn(tree)">
                    <Camera :size="14" />打卡
                  </a-button>
                </template>
                <a-list-item-meta
                  :title="`${tree.code} / ${tree.species}`"
                  :description="`${tree.siteName} · 胸径 ${tree.dbh || '未记录'}cm`"
                >
                  <template #avatar>
                    <span class="mini-tree-dot" />
                  </template>
                </a-list-item-meta>
              </a-list-item>
            </template>
          </a-list>
        </a-card>

        <a-card title="树种图鉴" :bordered="false">
          <div class="atlas-grid">
            <div
              v-for="species in ['银杏', '桂花', '樱花', '侧柏', '松树', '竹林']"
              :key="species"
              :class="fallbackUnlocked.includes(species) ? 'atlas-card unlocked' : 'atlas-card'"
            >
              <Sparkles :size="18" />
              <strong>{{ species }}</strong>
              <span>{{ fallbackUnlocked.includes(species) ? '已解锁' : '待打卡' }}</span>
            </div>
          </div>
        </a-card>
      </div>
    </template>
  </div>
</template>
