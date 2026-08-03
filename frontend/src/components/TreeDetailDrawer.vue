<script setup>
import { ref, computed, watch } from "vue";
import { Camera, ClipboardPlus, Download, Edit3, Save } from "lucide-vue-next";
import { message } from "ant-design-vue";
import { issueTypes, roleLabels } from "../api/mockApi";

const props = defineProps({
  tree: { type: Object, default: null },
  role: { type: String, default: "visitor" },
  open: { type: Boolean, default: false },
});

const emit = defineEmits(["close", "createWorkOrder", "updateTree"]);

const isEditing = ref(false);
const canReport = computed(() => props.role === "visitor" || props.role === "inspector" || props.role === "admin");
const canEditBase = computed(() => props.role === "admin");
const canEditHealth = computed(() => props.role === "admin" || props.role === "inspector");

// Reset editing when tree changes
watch(() => props.tree?.id, () => {
  isEditing.value = false;
});

const downloadTreeArchive = () => {
  if (!props.tree) return;
  const blob = new Blob([JSON.stringify(props.tree, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${props.tree.code}_tree_archive.json`;
  link.click();
  URL.revokeObjectURL(url);
  message.success("已导出单树档案 JSON");
};

const submitEdit = (values) => {
  if (!props.tree) return;
  emit("updateTree", {
    ...props.tree,
    species: values.species,
    dbh: values.dbh,
    treeType: values.treeType,
    protectionLevel: values.protectionLevel,
    healthStatus: values.healthStatus,
    locationDescription: values.locationDescription,
    story: values.story,
  });
  isEditing.value = false;
  message.success("树木档案已更新");
};

const addTreePhoto = () => {
  if (!props.tree) return;
  const nextPhoto = `https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=900&q=80&sig=${Date.now()}`;
  emit("updateTree", { ...props.tree, photos: [nextPhoto, ...props.tree.photos] });
  message.success("照片已加入树木档案");
};

const submitReport = (values, resetFields) => {
  if (!props.tree) return;
  const order = {
    id: `wo-${Date.now()}`,
    orderNo: `WO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`,
    treeId: props.tree.id,
    status: "reported",
    issueType: values.issueType,
    issueDescription: [values.issueDescription, values.locationDescription ? `相对位置：${values.locationDescription}` : ""]
      .filter(Boolean)
      .join("；"),
    issuePhotos: props.tree.photos,
    reporterRole: props.role === "maintenance" ? "admin" : props.role,
    reporterName: roleLabels[props.role],
    reportChannel: props.role === "visitor" ? "visitor" : props.role === "inspector" ? "inspection" : "admin",
    createdAt: new Date().toLocaleString("zh-CN", { hour12: false }),
  };
  emit("createWorkOrder", order);
  resetFields();
  message.success("已生成待派单工单");
};

const toggleHealth = () => {
  if (!props.tree) return;
  emit("updateTree", {
    ...props.tree,
    healthStatus: props.tree.healthStatus === "problem" ? "healthy" : "problem",
  });
};

// Edit form state
const editForm = ref({
  species: "",
  dbh: 0,
  treeType: "",
  protectionLevel: undefined,
  healthStatus: "healthy",
  locationDescription: "",
  story: "",
});

watch(() => props.tree, (tree) => {
  if (tree) {
    editForm.value = {
      species: tree.species,
      dbh: tree.dbh,
      treeType: tree.treeType,
      protectionLevel: tree.protectionLevel,
      healthStatus: tree.healthStatus,
      locationDescription: tree.locationDescription || "",
      story: tree.story || "",
    };
  }
}, { immediate: true });

// Report form state
const reportFormRef = ref(null);
const reportForm = ref({
  issueType: issueTypes[0],
  issueDescription: "",
  locationDescription: "",
});

const resetReportForm = () => {
  reportForm.value = {
    issueType: issueTypes[0],
    issueDescription: "",
    locationDescription: "",
  };
};

const handleSubmitReport = () => {
  submitReport(reportForm.value, resetReportForm);
};

const handleSubmitEdit = () => {
  submitEdit(editForm.value);
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
        <a-tag :color="tree.healthStatus === 'healthy' ? 'green' : tree.healthStatus === 'warning' ? 'gold' : 'red'">
          {{ tree.healthStatus === 'healthy' ? '健康' : tree.healthStatus === 'warning' ? '需观察' : '异常' }}
        </a-tag>
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

      <a-space wrap>
        <a-button :disabled="role === 'maintenance'" @click="addTreePhoto">
          <Camera :size="16" />上传照片
        </a-button>
        <a-button v-if="canEditBase" @click="isEditing = !isEditing">
          <Edit3 :size="16" />编辑档案
        </a-button>
        <a-button v-if="canEditHealth" @click="toggleHealth">
          切换健康状态
        </a-button>
        <a-button v-if="role === 'admin'" @click="downloadTreeArchive">
          <Download :size="16" />导出档案
        </a-button>
      </a-space>

      <!-- Edit Form -->
      <div v-if="isEditing && canEditBase" class="edit-box">
        <div class="section-title"><Edit3 :size="16" />档案编辑</div>
        <a-form layout="vertical" :model="editForm" @finish="handleSubmitEdit">
          <a-form-item label="树种" name="species" required>
            <a-input v-model:value="editForm.species" />
          </a-form-item>
          <a-form-item label="胸径(cm)" name="dbh" required>
            <a-input-number v-model:value="editForm.dbh" :min="0" :precision="1" class="full-width" />
          </a-form-item>
          <a-form-item label="类型" name="treeType" required>
            <a-select
              v-model:value="editForm.treeType"
              :options="[
                { label: '普通树', value: '普通树' },
                { label: '古树名木', value: '古树名木' },
                { label: '重点观察树', value: '重点观察树' },
              ]"
            />
          </a-form-item>
          <a-form-item label="保护等级" name="protectionLevel">
            <a-select
              v-model:value="editForm.protectionLevel"
              allow-clear
              :options="[
                { label: '一级保护', value: '一级保护' },
                { label: '二级保护', value: '二级保护' },
                { label: '三级保护', value: '三级保护' },
              ]"
            />
          </a-form-item>
          <a-form-item label="健康状态" name="healthStatus" required>
            <a-select
              v-model:value="editForm.healthStatus"
              :options="[
                { label: '健康', value: 'healthy' },
                { label: '需观察', value: 'warning' },
                { label: '异常', value: 'problem' },
              ]"
            />
          </a-form-item>
          <a-form-item label="相对位置描述" name="locationDescription">
            <a-textarea v-model:value="editForm.locationDescription" :rows="2" />
          </a-form-item>
          <a-form-item label="文化故事" name="story">
            <a-textarea v-model:value="editForm.story" :rows="3" />
          </a-form-item>
          <a-button type="primary" html-type="submit"><Save :size="16" />保存档案</a-button>
        </a-form>
      </div>

      <!-- Report Form -->
      <div v-if="canReport" class="report-box">
        <div class="section-title"><ClipboardPlus :size="16" />问题上报</div>
        <a-form layout="vertical" :model="reportForm" @finish="handleSubmitReport">
          <a-form-item label="问题类型" name="issueType" required>
            <a-select
              v-model:value="reportForm.issueType"
              :options="issueTypes.map((type) => ({ label: type, value: type }))"
            />
          </a-form-item>
          <a-form-item label="问题描述" name="issueDescription">
            <a-textarea v-model:value="reportForm.issueDescription" :rows="3" placeholder="补充问题位置、现象或现场判断" />
          </a-form-item>
          <a-form-item label="相对位置" name="locationDescription">
            <a-input v-model:value="reportForm.locationDescription" placeholder="例如：山门东侧第三排、碑亭北侧" />
          </a-form-item>
          <a-upload :before-upload="() => false" :max-count="3">
            <a-button><Camera :size="16" />添加问题照片</a-button>
          </a-upload>
          <a-button class="submit-report" type="primary" html-type="submit">
            提交并生成工单
          </a-button>
        </a-form>
      </div>
    </a-space>
  </a-drawer>

  <!-- Empty drawer (fallback) -->
  <a-drawer v-else :open="open" @close="emit('close')" title="树木详情" />
</template>
