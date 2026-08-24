<script setup>
import { ref, computed, watch } from "vue";
import { message } from "ant-design-vue";
import { healthOptions, issueTypes, roleLabels } from "../api/mockApi";

const props = defineProps({
  open: Boolean,
  trees: { type: Array, default: () => [] },
  role: { type: String, default: "inspector" },
  currentUser: { type: Object, default: null },
  currentUserName: { type: String, default: "" },
  preSelectedTree: { type: Object, default: null },
});

const emit = defineEmits(["close", "createOrder", "updateTree"]);

const createPhotos = ref([]);
const form = ref({
  treeId: undefined,
  issueType: issueTypes[0],
  issueDescription: "",
  locationDescription: "",
  healthStatus: "problem",
});

const treeOptions = computed(() =>
  props.trees.map((tree) => ({
    value: tree.id,
    label: `${tree.code} / ${tree.species} / ${tree.locationDescription || tree.siteName}`,
  }))
);
const displayUserName = computed(() => props.currentUserName || props.currentUser?.username || props.currentUser?.account || roleLabels[props.role]);

function toPhotoRecords(fileList) {
  return fileList.map((file) => ({
    uid: file.uid,
    name: file.name,
    url: file.url || file.thumbUrl || (file.originFileObj ? URL.createObjectURL(file.originFileObj) : ""),
  }));
}

function resetForm() {
  form.value = {
    treeId: props.preSelectedTree?.id ?? undefined,
    issueType: issueTypes[0],
    issueDescription: "",
    locationDescription: "",
    healthStatus: "problem",
  };
  createPhotos.value = [];
}

watch(() => props.open, (isOpen) => {
  if (isOpen) resetForm();
});

function handleCancel() {
  emit("close");
}

function handleSubmit() {
  if (!form.value.treeId) {
    message.error("请选择树木");
    return;
  }
  if (!form.value.issueDescription.trim()) {
    message.error("请填写问题描述");
    return;
  }
  if (createPhotos.value.length === 0) {
    message.error("创建工单必须上传照片");
    return;
  }

  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const order = {
    id: `wo-${Date.now()}`,
    orderNo: `WO-${dateStr}-${Math.floor(Math.random() * 900 + 100)}`,
    treeId: form.value.treeId,
    status: "processing",
    issueType: form.value.issueType,
    issueDescription: form.value.issueDescription,
    locationDescription: form.value.locationDescription,
    creatorId: props.currentUser?.id,
    creatorRole: props.role,
    creatorName: displayUserName.value,
    createPhotos: toPhotoRecords(createPhotos.value),
    treatmentPhotos: [],
    createdAt: now,
    updatedAt: now,
  };

  const tree = props.trees.find((t) => t.id === form.value.treeId);
  if (tree && tree.healthStatus !== form.value.healthStatus) {
    emit("updateTree", { ...tree, healthStatus: form.value.healthStatus });
  }
  emit("createOrder", order);
}
</script>

<template>
  <a-modal
    :open="open"
    :width="640"
    wrap-class-name="mobile-work-order-modal"
    title="创建正式工单"
    :footer="null"
    :mask-closable="false"
    @cancel="handleCancel"
    destroy-on-close
  >
    <a-form layout="vertical" :model="form" @finish="handleSubmit">
      <!-- Tree selection -->
      <a-form-item label="树木" required>
        <a-select
          v-if="!preSelectedTree"
          v-model:value="form.treeId"
          show-search
          :filter-option="(input, option) => String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())"
          :options="treeOptions"
          placeholder="搜索树木编号、树种或位置"
        />
        <a-input
          v-else
          :value="`${preSelectedTree.code} / ${preSelectedTree.species}`"
          disabled
        />
      </a-form-item>

      <div class="work-order-form-grid">
        <a-form-item label="问题类型" required>
          <a-select
            v-model:value="form.issueType"
            :options="issueTypes.map((type) => ({ label: type, value: type }))"
          />
        </a-form-item>
        <a-form-item label="健康状态" required>
          <a-select
            v-model:value="form.healthStatus"
            :options="healthOptions"
          />
        </a-form-item>
      </div>

      <a-form-item label="问题描述" required>
        <a-textarea
          v-model:value="form.issueDescription"
          :rows="3"
          placeholder="描述现场问题、位置和初步判断"
        />
      </a-form-item>

      <a-form-item label="相对位置">
        <a-input
          v-model:value="form.locationDescription"
          placeholder="例如：山门东侧第三排、碑亭北侧"
        />
      </a-form-item>

      <a-form-item label="创建照片" required>
        <a-upload
          v-model:file-list="createPhotos"
          :before-upload="() => false"
          :max-count="4"
          list-type="picture"
        >
          <a-button>上传创建照片</a-button>
        </a-upload>
      </a-form-item>

      <a-space wrap>
        <a-button type="primary" html-type="submit">提交工单</a-button>
        <a-button @click="handleCancel">取消</a-button>
      </a-space>
    </a-form>
  </a-modal>
</template>
