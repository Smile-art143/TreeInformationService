<script setup>
import { ref } from "vue";
import { Camera, MapPin, Navigation, Send, Sparkles } from "lucide-vue-next";
import { message } from "ant-design-vue";

const props = defineProps({
  trees: { type: Array, default: () => [] },
});

const emit = defineEmits(["focusTree"]);

const unlockedSpecies = ref(["银杏"]);
const nearbyTrees = props.trees.slice(0, 6);

const checkIn = (tree) => {
  unlockedSpecies.value = Array.from(new Set([...unlockedSpecies.value, tree.species]));
  message.success(`已打卡 ${tree.code}，解锁 ${tree.species} 图鉴`);
};

const submitStory = () => {
  message.success("故事投稿已提交");
};
</script>

<template>
  <div class="guide-page">
    <div class="page-heading">
      <div>
        <h1>旅游导览</h1>
        <p>面向游客的附近树木、拍照打卡、树种图鉴和故事投稿入口。</p>
      </div>
      <a-button @click="emit('focusTree', nearbyTrees[0].id)">
        <Navigation :size="16" />定位附近树木
      </a-button>
    </div>

    <div class="guide-layout">
      <!-- Nearby Trees -->
      <a-card title="附近树木" :bordered="false">
        <a-list :data-source="nearbyTrees">
          <template #renderItem="{ item: tree }">
            <a-list-item>
              <template #actions>
                <a-button size="small" @click="emit('focusTree', tree.id)">查看</a-button>
                <a-button size="small" type="primary" @click="checkIn(tree)">
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

      <!-- Tree Atlas -->
      <a-card title="树种图鉴" :bordered="false">
        <div class="atlas-grid">
          <div
            v-for="species in ['银杏', '桂花', '樱花', '侧柏', '松树', '竹林']"
            :key="species"
            :class="unlockedSpecies.includes(species) ? 'atlas-card unlocked' : 'atlas-card'"
          >
            <Sparkles :size="18" />
            <strong>{{ species }}</strong>
            <span>{{ unlockedSpecies.includes(species) ? '已解锁' : '待打卡' }}</span>
          </div>
        </div>
      </a-card>

      <!-- Story Submission -->
      <a-card title="树木故事投稿" :bordered="false">
        <a-form layout="vertical" @finish="submitStory">
          <a-form-item label="关联树木">
            <a-input placeholder="树木编号，如 DX-1" />
          </a-form-item>
          <a-form-item label="故事内容" required>
            <a-textarea :rows="5" placeholder="记录树木故事、游览体验或文化线索" />
          </a-form-item>
          <a-upload :before-upload="() => false" :max-count="3">
            <a-button><Camera :size="16" />添加照片</a-button>
          </a-upload>
          <a-button class="submit-report" type="primary" html-type="submit">
            <Send :size="16" />提交故事
          </a-button>
        </a-form>
      </a-card>

      <!-- Tour Tips -->
      <a-card title="游览提示" :bordered="false">
        <a-space wrap>
          <a-tag color="gold"><MapPin :size="13" /> 银杏 11月</a-tag>
          <a-tag color="green"><MapPin :size="13" /> 桂花 9月下旬</a-tag>
          <a-tag color="pink"><MapPin :size="13" /> 樱花 3月底-4月初</a-tag>
        </a-space>
        <p class="guide-copy">结合季节物候和树木分布，推荐适合拍照、研学和日常游览的树木点位。</p>
      </a-card>
    </div>
  </div>
</template>
