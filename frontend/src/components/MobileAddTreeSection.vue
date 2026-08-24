<script setup>
import { inject, ref, watch } from "vue";
import { message } from "ant-design-vue";

const app = inject("appState");
const { addTree } = app;

const addTreeForm = ref({
  code: "",
  species: "",
  locationDescription: "",
  dbh: null,
  longitude: "",
  latitude: "",
  treeType: "普通树",
  protectionLevel: null,
  healthStatus: "healthy",
  story: "",
});
const addTreePhotos = ref([]);

const treeTypeOptions = [
  { label: "普通树", value: "普通树" },
  { label: "古树", value: "古树" },
];

const protectionLevelOptions = [
  { label: "一级保护", value: "一级保护" },
  { label: "二级保护", value: "二级保护" },
  { label: "三级保护", value: "三级保护" },
];

const healthStatusOptions = [
  { label: "正常", value: "healthy" },
  { label: "异常", value: "problem" },
];

function resetForm() {
  addTreeForm.value = {
    code: "",
    species: "",
    locationDescription: "",
    dbh: null,
    longitude: "",
    latitude: "",
    treeType: "普通树",
    protectionLevel: null,
    healthStatus: "healthy",
    story: "",
  };
  addTreePhotos.value = [];
}

function toPhotoRecords(fileList) {
  return fileList.map((file) => ({
    uid: file.uid,
    name: file.name,
    url:
      file.url ||
      file.thumbUrl ||
      (file.originFileObj ? URL.createObjectURL(file.originFileObj) : ""),
  }));
}

function handleAddTree() {
  if (!addTreeForm.value.code.trim()) {
    message.error("请输入编号");
    return;
  }
  if (!addTreeForm.value.species.trim()) {
    message.error("请输入树种名称");
    return;
  }
  if (!addTreeForm.value.longitude || !addTreeForm.value.latitude) {
    message.error("请输入坐标");
    return;
  }

  const photos = toPhotoRecords(addTreePhotos.value);
  addTree({
    ...addTreeForm.value,
    photos,
  });
  resetForm();
  message.success("树木已添加");
}

watch(
  () => addTreeForm.value.treeType,
  (value) => {
    if (value === "普通树") {
      addTreeForm.value.protectionLevel = null;
    }
  }
);
</script>

<template>
  <div class="mobile-add-tree-page">
    <div class="mobile-section-heading">
      <h1>添树</h1>
    </div>

    <a-card class="mobile-card" :bordered="false">
      <a-form layout="vertical" :model="addTreeForm">
        <a-form-item label="编号" required>
          <a-input v-model:value="addTreeForm.code" placeholder="例如：DX-500" />
        </a-form-item>

        <a-form-item label="树种名称" required>
          <a-input v-model:value="addTreeForm.species" placeholder="例如：银杏、国槐" />
        </a-form-item>

        <a-form-item label="位置">
          <a-input
            v-model:value="addTreeForm.locationDescription"
            placeholder="例如：山门东侧第三排"
          />
        </a-form-item>

        <a-form-item label="胸径 (cm)" required>
          <a-input-number
            v-model:value="addTreeForm.dbh"
            :min="0"
            :step="0.1"
            style="width: 100%"
            placeholder="例如：35.5"
          />
        </a-form-item>

        <a-form-item label="坐标" required>
          <div class="mobile-coord-grid">
            <a-input
              v-model:value="addTreeForm.longitude"
              placeholder="经度"
            />
            <a-input
              v-model:value="addTreeForm.latitude"
              placeholder="纬度"
            />
          </div>
        </a-form-item>

        <a-form-item label="类型" >
          <a-select
            v-model:value="addTreeForm.treeType"
            :options="treeTypeOptions"
          />
        </a-form-item>

        <a-form-item v-if="addTreeForm.treeType === '古树'" label="保护等级">
          <a-select
            v-model:value="addTreeForm.protectionLevel"
            :options="protectionLevelOptions"
            placeholder="请选择保护等级"
          />
        </a-form-item>

        <a-form-item label="资料卡片">
          <a-textarea
            v-model:value="addTreeForm.story"
            :rows="3"
            placeholder="树木的历史背景、文化故事等"
          />
        </a-form-item>

        <a-form-item label="健康状态" >
          <a-select
            v-model:value="addTreeForm.healthStatus"
            :options="healthStatusOptions"
          />
        </a-form-item>

        <a-form-item label="树木照片" required>
          <a-upload
            v-model:file-list="addTreePhotos"
            :before-upload="() => false"
            :max-count="3"
            list-type="picture"
          >
            <a-button>选择照片</a-button>
          </a-upload>
        </a-form-item>

        <a-form-item>
          <a-button type="primary" block size="large" @click="handleAddTree">
            添加
          </a-button>
        </a-form-item>
      </a-form>
    </a-card>
  </div>
</template>

<style scoped>
.mobile-add-tree-page {
  padding: 16px 14px 24px;
}

.mobile-add-tree-page :deep(.ant-card-body) {
  padding: 16px;
}

.mobile-coord-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
</style>
