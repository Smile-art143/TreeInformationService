<script setup>
import { ref, computed, watch } from "vue";
import { Camera, ClipboardPlus, HeartPulse } from "lucide-vue-next";
import { message } from "ant-design-vue";
import { healthLabels, healthOptions, issueTypes } from "../api/mockApi";

const props = defineProps({
  tree: { type: Object, default: null },
  role: { type: String, default: "visitor" },
  open: { type: Boolean, default: false },
});

const emit = defineEmits(["close", "createVisitorLead", "updateTree"]);

const canSubmitLead = computed(() => props.role === "visitor");
const canEditHealth = computed(() => props.role === "inspector" || props.role === "maintenance");

const healthColor = computed(() => {
  if (!props.tree) return "default";
  if (props.tree.healthStatus === "healthy") return "green";
  if (props.tree.healthStatus === "warning") return "gold";
  return "red";
});

const leadForm = ref({
  issueType: issueTypes[0],
  issueDescription: "",
  locationDescription: "",
});
const leadPhotos = ref([]);

watch(() => props.tree?.id, () => {
  leadForm.value = {
    issueType: issueTypes[0],
    issueDescription: "",
    locationDescription: "",
  };
  leadPhotos.value = [];
});

const toPhotoRecords = (fileList) =>
  fileList.map((file) => ({
    uid: file.uid,
    name: file.name,
    url: file.url || file.thumbUrl || (file.originFileObj ? URL.createObjectURL(file.originFileObj) : ""),
  }));

const addTreePhoto = () => {
  if (!props.tree) return;
  const nextPhoto = `https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=900&q=80&sig=${Date.now()}`;
  emit("updateTree", { ...props.tree, photos: [nextPhoto, ...props.tree.photos] });
  message.success("照片已加入树木档案");
};

const updateHealth = (healthStatus) => {
  if (!props.tree) return;
  emit("updateTree", { ...props.tree, healthStatus });
  message.success(`树木健康状态已更新为${healthLabels[healthStatus]}`);
};

const submitLead = () => {
  if (!props.tree) return;
  if (!leadForm.value.issueDescription.trim()) {
    message.error("请填写问题描述");
    return;
  }
  if (leadPhotos.value.length === 0) {
    message.error("提交游客线索必须上传照片");
    return;
  }

  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  emit("createVisitorLead", {
    id: `lead-${Date.now()}`,
    leadNo: `LEAD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`,
    treeId: props.tree.id,
    status: "new",
    issueType: leadForm.value.issueType,
    issueDescription: leadForm.value.issueDescription,
    locationDescription: leadForm.value.locationDescription,
    photos: toPhotoRecords(leadPhotos.value),
    createdAt: now,
    convertedAt: undefined,
    convertedOrderId: undefined,
  });

  leadForm.value = {
    issueType: issueTypes[0],
    issueDescription: "",
    locationDescription: "",
  };
  leadPhotos.value = [];
  message.success("游客线索已提交，等待巡检人员确认");
};
</script>

<template>
  <a-drawer
    v-if="tree"
    :width="430"
    :open="open"
    @close="emit('close')"
  >
    <template #title>
      <div class="drawer-title">
        <span>{{ tree.species }}</span>
        <a-tag :color="healthColor">{{ healthLabels[tree.healthStatus] }}</a-tag>
      </div>
    </template>

    <a-space direction="vertical" :size="18" class="full-width">
      <img class="tree-photo" :src="tree.photos[0]" :alt="`${tree.species}照片`" />

      <a-descriptions bordered size="small" :column="1">
        <a-descriptions-item label="编号">
          <span class="data-value">{{ tree.code }}</span>
        </a-descriptions-item>
        <a-descriptions-item label="位置">{{ tree.siteName }}</a-descriptions-item>
        <a-descriptions-item label="胸径">
          <span class="data-value">{{ tree.dbh || '未记录' }} cm</span>
        </a-descriptions-item>
        <a-descriptions-item label="坐标">
          <span class="data-value">{{ tree.longitude.toFixed(6) }}, {{ tree.latitude.toFixed(6) }}</span>
        </a-descriptions-item>
        <a-descriptions-item label="类型">{{ tree.treeType }}</a-descriptions-item>
        <a-descriptions-item label="保护等级">{{ tree.protectionLevel ?? '无' }}</a-descriptions-item>
        <a-descriptions-item label="相对位置">{{ tree.locationDescription }}</a-descriptions-item>
      </a-descriptions>

      <div class="story-block">
        <div class="section-title">树木故事</div>
        <p>{{ tree.story }}</p>
      </div>

      <div v-if="canEditHealth" class="edit-box">
        <div class="section-title"><HeartPulse :size="16" />健康状态</div>
        <a-space wrap>
          <a-select
            :value="tree.healthStatus"
            style="width: 160px"
            :options="healthOptions"
            @change="updateHealth"
          />
          <a-button @click="addTreePhoto">
            <Camera :size="16" />补充树木照片
          </a-button>
        </a-space>
      </div>

      <div v-if="canSubmitLead" class="report-box">
        <div class="section-title"><ClipboardPlus :size="16" />提交游客线索</div>
        <a-form layout="vertical" @finish="submitLead">
          <a-form-item label="问题类型" required>
            <a-select
              v-model:value="leadForm.issueType"
              :options="issueTypes.map((type) => ({ label: type, value: type }))"
            />
          </a-form-item>
          <a-form-item label="问题描述" required>
            <a-textarea v-model:value="leadForm.issueDescription" :rows="3" placeholder="补充问题位置、现象或现场判断" />
          </a-form-item>
          <a-form-item label="相对位置">
            <a-input v-model:value="leadForm.locationDescription" placeholder="例如：山门东侧第三排、碑亭北侧" />
          </a-form-item>
          <a-form-item label="现场照片" required>
            <a-upload
              v-model:file-list="leadPhotos"
              :before-upload="() => false"
              :max-count="3"
              list-type="picture"
            >
              <a-button><Camera :size="16" />添加线索照片</a-button>
            </a-upload>
          </a-form-item>
          <a-button class="submit-report" type="primary" html-type="submit">
            提交线索
          </a-button>
        </a-form>
      </div>
    </a-space>
  </a-drawer>

  <a-drawer v-else :open="open" @close="emit('close')" title="树木详情" />
</template>
