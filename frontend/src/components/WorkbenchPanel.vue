<script setup>
import { computed, inject, ref, watch } from "vue";
import { CheckCircle2, ClipboardList, Download, Navigation, Plus, RotateCcw, Wrench } from "lucide-vue-next";
import { message } from "ant-design-vue";
import { healthLabels, healthOptions, issueTypes, leadStatusLabels, roleLabels, statusLabels } from "../api/mockApi";

const props = defineProps({
  role: { type: String, default: "inspector" },
  workOrders: { type: Array, default: () => [] },
  visitorLeads: { type: Array, default: () => [] },
  trees: { type: Array, default: () => [] },
  selectedOrder: { type: Object, default: null },
});

const emit = defineEmits(["selectOrder", "updateOrder", "createOrder", "convertLead", "updateTree", "deleteLead"]);

const { navigateToGuideWithOrder } = inject("appState");

function jumpToGuide() {
  if (props.selectedOrder) {
    navigateToGuideWithOrder(props.selectedOrder.id);
  }
}

const statusColor = {
  created: "default",
  processing: "blue",
  reviewing: "purple",
  archived: "green",
};

const leadStatusColor = {
  new: "orange",
  converted: "green",
};

const activeTab = ref("orders");
const statusFilter = ref("all");
const showCreateForm = ref(false);
const createPhotos = ref([]);
const treatmentPhotos = ref([]);
const treatmentForm = ref({ treatmentMeasures: "" });
const reviewForm = ref({ reviewComment: "", healthStatus: "warning" });

const createForm = ref({
  treeId: undefined,
  issueType: issueTypes[0],
  issueDescription: "",
  healthStatus: "problem",
});

const canCreateOrder = computed(() => props.role === "inspector" || props.role === "maintenance");
const canReview = computed(() => props.role === "inspector");
const canTreat = computed(() => props.role === "maintenance");

const treeOptions = computed(() =>
  props.trees.map((tree) => ({
    value: tree.id,
    label: `${tree.code} / ${tree.species} / ${tree.locationDescription || tree.siteName}`,
  }))
);

const filteredOrders = computed(() => {
  if (statusFilter.value === "all") return props.workOrders;
  return props.workOrders.filter((order) => order.status === statusFilter.value);
});

const orderStats = computed(() => {
  const acc = { created: props.workOrders.length, processing: 0, reviewing: 0, archived: 0 };
  props.workOrders.forEach((order) => {
    if (order.status !== "created") acc[order.status] = (acc[order.status] ?? 0) + 1;
  });
  return acc;
});

const selectedTree = computed(() => props.selectedOrder ? getTreeForOrder(props.selectedOrder) : undefined);

watch(() => props.selectedOrder?.id, () => {
  treatmentForm.value = {
    treatmentMeasures: "",
  };
  treatmentPhotos.value = [];
  reviewForm.value = { reviewComment: "", healthStatus: selectedTree.value?.healthStatus ?? "warning" };
});

const getTreeById = (treeId) => props.trees.find((tree) => tree.id === treeId);
const getTreeForOrder = (order) => getTreeById(order.treeId);
const getTreeForLead = (lead) => getTreeById(lead.treeId);

const toPhotoRecords = (fileList) =>
  fileList.map((file) => ({
    uid: file.uid,
    name: file.name,
    url: file.url || file.thumbUrl || (file.originFileObj ? URL.createObjectURL(file.originFileObj) : ""),
  }));

const exportOrders = () => {
  const header = ["工单编号", "树木ID", "问题类型", "状态", "创建人", "创建时间", "处置时间", "复核时间", "归档时间"];
  const rows = props.workOrders.map((order) => [
    order.orderNo,
    order.treeId,
    order.issueType,
    statusLabels[order.status],
    order.creatorName ?? "",
    order.createdAt ?? "",
    order.processedAt ?? "",
    order.reviewedAt ?? "",
    order.archivedAt ?? "",
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "work_orders.csv";
  link.click();
  URL.revokeObjectURL(url);
  message.success("已导出工单台账 CSV");
};

const resetCreateForm = () => {
  createForm.value = {
    treeId: undefined,
    issueType: issueTypes[0],
    issueDescription: "",
    locationDescription: "",
    healthStatus: "problem",
  };
  createPhotos.value = [];
};

const createOrder = () => {
  if (!createForm.value.treeId) {
    message.error("请选择树木");
    return;
  }
  if (!createForm.value.issueDescription.trim()) {
    message.error("请填写问题描述");
    return;
  }
  if (createPhotos.value.length === 0) {
    message.error("创建工单必须上传照片");
    return;
  }

  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  const order = {
    id: `wo-${Date.now()}`,
    orderNo: `WO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`,
    treeId: createForm.value.treeId,
    status: "processing",
    issueType: createForm.value.issueType,
    issueDescription: createForm.value.issueDescription,
    locationDescription: createForm.value.locationDescription,
    creatorRole: props.role,
    creatorName: roleLabels[props.role],
    createPhotos: toPhotoRecords(createPhotos.value),
    treatmentPhotos: [],
    createdAt: now,
    updatedAt: now,
  };

  const tree = getTreeById(createForm.value.treeId);
  if (tree && tree.healthStatus !== createForm.value.healthStatus) {
    emit("updateTree", { ...tree, healthStatus: createForm.value.healthStatus });
  }
  emit("createOrder", order);
  resetCreateForm();
  showCreateForm.value = false;
  message.success("正式工单已创建，状态为待处置");
};

const submitTreatment = (order) => {
  if (!treatmentForm.value.treatmentMeasures.trim()) {
    message.error("请填写处置措施");
    return;
  }
  if (treatmentPhotos.value.length === 0) {
    message.error("提交处置必须上传照片");
    return;
  }

  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  const tree = getTreeForOrder(order);
  if (tree && tree.healthStatus !== "warning") {
    emit("updateTree", { ...tree, healthStatus: "warning" });
  }
  emit("updateOrder", {
    ...order,
    status: "reviewing",
    treatmentMeasures: treatmentForm.value.treatmentMeasures,
    treatmentPhotos: toPhotoRecords(treatmentPhotos.value),
    processedAt: now,
    updatedAt: now,
  });
  treatmentPhotos.value = [];
  treatmentForm.value = { treatmentMeasures: "" };
  message.success("处置结果已提交，等待巡检复核");
};

const reviewOrder = (order, passed) => {
  if (!reviewForm.value.healthStatus) {
    message.error("请选择复核后健康状态");
    return;
  }

  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  const tree = getTreeForOrder(order);
  if (tree && tree.healthStatus !== reviewForm.value.healthStatus) {
    emit("updateTree", { ...tree, healthStatus: reviewForm.value.healthStatus });
  }
  emit("updateOrder", {
    ...order,
    status: passed ? "archived" : "processing",
    reviewUserName: "巡检人员",
    reviewTime: now,
    reviewedAt: now,
    archivedAt: passed ? now : order.archivedAt,
    reviewResult: passed ? "passed" : "rework",
    reviewComment: reviewForm.value.reviewComment || (passed ? "处置效果达标，归档。" : "处置效果不足，退回待处置。"),
    reviewHealthStatus: reviewForm.value.healthStatus,
    updatedAt: now,
  });
  reviewForm.value = { reviewComment: "", healthStatus: selectedTree.value?.healthStatus ?? "warning" };
  message.success(passed ? "工单已复核归档" : "工单已退回待处置");
};

const viewingLead = ref(null);
const leadEditForm = ref({ issueType: "", issueDescription: "", locationDescription: "" });
const leadHealthStatus = ref("healthy");

const openLeadDrawer = (lead) => {
  viewingLead.value = lead;
  leadEditForm.value = {
    issueType: lead.issueType || "",
    issueDescription: lead.issueDescription || "",
    locationDescription: lead.locationDescription || "",
  };
  leadHealthStatus.value = lead.healthStatus || "healthy";
};

const convertLeadFromDrawer = () => {
  if (!viewingLead.value) return;
  if (props.role !== "inspector") {
    message.error("只有巡检人员可以将游客线索转为正式工单");
    return;
  }
  const updatedLead = {
    ...viewingLead.value,
    issueType: leadEditForm.value.issueType,
    issueDescription: leadEditForm.value.issueDescription,
    locationDescription: leadEditForm.value.locationDescription,
    healthStatus: leadHealthStatus.value,
  };
  emit("convertLead", updatedLead);
  viewingLead.value = null;
  activeTab.value = "orders";
  message.success("游客线索已转为正式工单");
};

const deleteLeadFromDrawer = () => {
  if (!viewingLead.value) return;
  emit("deleteLead", viewingLead.value.id);
  viewingLead.value = null;
  message.success("游客线索已删除");
};

const columns = [
  { title: "工单编号", dataIndex: "orderNo", width: 180 },
  { title: "树木", key: "tree", width: 180 },
  { title: "问题", dataIndex: "issueType", width: 110 },
  { title: "状态", key: "status", width: 110 },
  { title: "创建人", key: "creator", width: 110 },
  { title: "更新时间", dataIndex: "updatedAt", width: 160 },
  { title: "操作", key: "action", width: 210 },
];

const leadColumns = [
  { title: "线索编号", dataIndex: "leadNo", width: 180 },
  { title: "树木", key: "tree", width: 180 },
  { title: "问题", dataIndex: "issueType", width: 110 },
  { title: "状态", key: "status", width: 100 },
  { title: "提交时间", dataIndex: "createdAt", width: 160 },
  { title: "操作", key: "action", width: 150 },
];
</script>

<template>
  <div class="workbench-page">
    <div class="page-heading">
      <div>
        <h1>工单处理</h1>
        <p>围绕创建、处置、复核、归档四个环节记录照片、状态和时间戳。</p>
      </div>
      <a-space wrap>
        <a-button v-if="canCreateOrder" type="primary" @click="showCreateForm = !showCreateForm">
          <Plus :size="16" />创建正式工单
        </a-button>
        <a-button @click="exportOrders"><Download :size="16" />导出工单台账</a-button>
      </a-space>
    </div>

    <div class="workbench-stats">
      <a-card :bordered="false"><a-statistic title="已创建" :value="orderStats.created" /></a-card>
      <a-card :bordered="false"><a-statistic title="待处置" :value="orderStats.processing" /></a-card>
      <a-card :bordered="false"><a-statistic title="待复核" :value="orderStats.reviewing" /></a-card>
      <a-card :bordered="false"><a-statistic title="已归档" :value="orderStats.archived" /></a-card>
    </div>

    <a-card v-if="showCreateForm && canCreateOrder" :bordered="false" class="table-card">
      <div class="panel-title table-title">
        <Plus :size="18" />
        <span>创建正式工单</span>
      </div>
      <a-form layout="vertical" :model="createForm" @finish="createOrder">
        <div class="work-order-form-grid">
          <a-form-item label="树木" required>
            <a-select
              v-model:value="createForm.treeId"
              show-search
              :filter-option="(input, option) => String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())"
              :options="treeOptions"
              placeholder="搜索树木编号、树种或位置"
            />
          </a-form-item>
          <a-form-item label="问题类型" required>
            <a-select v-model:value="createForm.issueType" :options="issueTypes.map((type) => ({ label: type, value: type }))" />
          </a-form-item>
          <a-form-item label="健康状态" required>
            <a-select v-model:value="createForm.healthStatus" :options="healthOptions" />
          </a-form-item>
        </div>
        <a-form-item label="问题描述" required>
          <a-textarea v-model:value="createForm.issueDescription" :rows="3" placeholder="描述现场问题、位置和初步判断" />
        </a-form-item>
        <a-form-item label="相对位置">
            <a-input v-model:value="createForm.locationDescription" placeholder="例如：山门东侧第三排、碑亭北侧" />
        </a-form-item>
        <a-form-item label="创建照片" required>
          <a-upload v-model:file-list="createPhotos" :before-upload="() => false" :max-count="4" list-type="picture">
            <a-button>上传创建照片</a-button>
          </a-upload>
        </a-form-item>
        <a-space wrap>
          <a-button type="primary" html-type="submit">提交工单</a-button>
          <a-button @click="() => { showCreateForm = false; resetCreateForm(); }">取消</a-button>
        </a-space>
      </a-form>
    </a-card>

    <a-tabs v-model:active-key="activeTab">
      <a-tab-pane key="orders" tab="正式工单">
        <a-card :bordered="false" class="table-card">
          <div class="table-toolbar">
            <div class="panel-title table-title">
              <ClipboardList :size="18" />
              <span>正式工单列表</span>
            </div>
            <a-space wrap>
              <a-select
                :value="statusFilter"
                style="width: 140px"
                @change="statusFilter = $event"
                :options="[
                  { label: '全部状态', value: 'all' },
                  ...Object.entries(statusLabels).map(([value, label]) => ({ value, label })),
                ]"
              />
              <a-button @click="statusFilter = 'all'"><RotateCcw :size="15" />重置</a-button>
            </a-space>
          </div>

          <a-table row-key="id" :columns="columns" :data-source="filteredOrders" :pagination="{ pageSize: 8 }" :scroll="{ x: 1050 }">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'tree'">
                <template v-if="getTreeForOrder(record)">
                  <span class="data-value">{{ getTreeForOrder(record).code }}</span>
                  / {{ getTreeForOrder(record).species }}
                </template>
                <span v-else class="data-value">{{ record.treeId }}</span>
              </template>
              <template v-else-if="column.key === 'status'">
                <a-tag :color="statusColor[record.status]">{{ statusLabels[record.status] }}</a-tag>
              </template>
              <template v-else-if="column.key === 'creator'">
                {{ record.creatorName ?? roleLabels[record.creatorRole] ?? "未知" }}
              </template>
              <template v-else-if="column.key === 'action'">
                <a-space>
                  <a-button
                    v-if="!(canReview && record.status === 'reviewing') && !(canTreat && record.status === 'processing')"
                    size="small"
                    @click="emit('selectOrder', record)"
                  >
                    详情
                  </a-button>
                  <a-button
                    v-if="canTreat && record.status === 'processing'"
                    size="small"
                    type="primary"
                    @click="navigateToGuideWithOrder(record.id)"
                  >
                    <Navigation :size="14" />处置
                  </a-button>
                  <a-button
                    v-if="canReview && record.status === 'reviewing'"
                    size="small"
                    type="primary"
                    @click="navigateToGuideWithOrder(record.id)"
                  >
                    <Navigation :size="14" />复核
                  </a-button>
                </a-space>
              </template>
            </template>
          </a-table>
        </a-card>
      </a-tab-pane>

      <a-tab-pane key="leads" :tab="`游客线索 ${visitorLeads.filter((lead) => lead.status === 'new').length}`">
        <a-card :bordered="false" class="table-card">
          <a-table row-key="id" :columns="leadColumns" :data-source="visitorLeads" :pagination="{ pageSize: 8 }" :scroll="{ x: 880 }">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'tree'">
                <template v-if="getTreeForLead(record)">
                  <span class="data-value">{{ getTreeForLead(record).code }}</span>
                  / {{ getTreeForLead(record).species }}
                </template>
                <span v-else class="data-value">{{ record.treeId }}</span>
              </template>
              <template v-else-if="column.key === 'status'">
                <a-tag :color="leadStatusColor[record.status]">{{ leadStatusLabels[record.status] }}</a-tag>
              </template>
              <template v-else-if="column.key === 'action'">
                <a-space>
                  <a-button size="small" @click="openLeadDrawer(record)">查看</a-button>
                </a-space>
              </template>
            </template>
          </a-table>
        </a-card>
      </a-tab-pane>
    </a-tabs>

    <a-drawer :width="460" :open="Boolean(selectedOrder)" @close="emit('selectOrder', null)" title="工单详情">
      <a-space v-if="selectedOrder" direction="vertical" :size="16" class="full-width">
        <a-tag :color="statusColor[selectedOrder.status]">{{ statusLabels[selectedOrder.status] }}</a-tag>
        <a-button
          v-if="(canTreat && selectedOrder.status === 'processing') || (canReview && selectedOrder.status === 'reviewing')"
          type="link"
          @click="jumpToGuide"
          style="margin-left: 8px;"
        >
          <Navigation :size="14" /> 导航前往
        </a-button>

        <a-descriptions bordered size="small" :column="1">
          <a-descriptions-item label="工单编号"><span class="data-value">{{ selectedOrder.orderNo }}</span></a-descriptions-item>
          <a-descriptions-item label="问题类型">{{ selectedOrder.issueType }}</a-descriptions-item>
          <a-descriptions-item label="问题描述">{{ selectedOrder.issueDescription }}</a-descriptions-item>
          <a-descriptions-item label="相对位置">{{ selectedOrder.locationDescription }}</a-descriptions-item>
          <a-descriptions-item label="创建人">{{ selectedOrder.creatorName ?? roleLabels[selectedOrder.creatorRole] }}</a-descriptions-item>
          <a-descriptions-item label="创建时间">{{ selectedOrder.createdAt }}</a-descriptions-item>
          <a-descriptions-item label="处置时间">{{ selectedOrder.processedAt ?? "未处置" }}</a-descriptions-item>
          <a-descriptions-item label="复核时间">{{ selectedOrder.reviewedAt ?? "未复核" }}</a-descriptions-item>
          <a-descriptions-item label="归档时间">{{ selectedOrder.archivedAt ?? "未归档" }}</a-descriptions-item>
        </a-descriptions>

        <a-descriptions v-if="selectedTree" bordered size="small" :column="1">
          <a-descriptions-item label="树木编号"><span class="data-value">{{ selectedTree.code }}</span></a-descriptions-item>
          <a-descriptions-item label="树种">{{ selectedTree.species }}</a-descriptions-item>
          <a-descriptions-item label="胸径">{{ selectedTree.dbh ? selectedTree.dbh + ' cm' : '未记录' }}</a-descriptions-item>
          <a-descriptions-item label="健康状态">{{ healthLabels[selectedTree.healthStatus] }}</a-descriptions-item>
          
        </a-descriptions>

        <div v-if="selectedOrder.createPhotos?.length" class="story-block">
          <div class="section-title">创建照片</div>
          <div class="photo-strip">
            <img v-for="photo in selectedOrder.createPhotos" :key="photo.uid" :src="photo.url" :alt="photo.name" />
          </div>
        </div>

        <div v-if="selectedOrder.treatmentMeasures" class="story-block">
          <div class="section-title">处置反馈</div>
          <p>{{ selectedOrder.treatmentMeasures }}</p>
          <div v-if="selectedOrder.treatmentPhotos?.length" class="photo-strip">
            <img v-for="photo in selectedOrder.treatmentPhotos" :key="photo.uid" :src="photo.url" :alt="photo.name" />
          </div>
        </div>

        <div v-if="selectedOrder.reviewComment" class="story-block">
          <div class="section-title">复核意见</div>
          <p>{{ selectedOrder.reviewComment }}</p>
        </div>

        <div v-if="canTreat && selectedOrder.status === 'processing'" class="edit-box">
          <div class="section-title"><Wrench :size="16" />处置反馈</div>
          <a-form layout="vertical" :model="treatmentForm" @finish="submitTreatment(selectedOrder)">
            <a-form-item label="处置措施" required>
              <a-textarea v-model:value="treatmentForm.treatmentMeasures" :rows="4" placeholder="填写修剪、清理、支撑、病虫害处理等措施" />
            </a-form-item>
            <a-form-item label="处置照片" required>
              <a-upload v-model:file-list="treatmentPhotos" :before-upload="() => false" :max-count="4" list-type="picture">
                <a-button>添加处置照片</a-button>
              </a-upload>
            </a-form-item>
            <a-button class="submit-report" type="primary" html-type="submit">
              <Wrench :size="16" />提交复核
            </a-button>
          </a-form>
        </div>

        <div v-if="canReview && selectedOrder.status === 'reviewing'" class="edit-box">
          <div class="section-title"><CheckCircle2 :size="16" />复核处理</div>
          <a-form layout="vertical">
            <a-form-item label="复核后健康状态" required>
              <a-select v-model:value="reviewForm.healthStatus" :options="healthOptions" />
            </a-form-item>
            <a-form-item label="复核意见">
              <a-textarea v-model:value="reviewForm.reviewComment" :rows="3" placeholder="填写复核意见" />
            </a-form-item>
            <a-space wrap>
              <a-button type="primary" @click="reviewOrder(selectedOrder, true)">通过并归档</a-button>
              <a-button danger @click="reviewOrder(selectedOrder, false)">退回待处置</a-button>
            </a-space>
          </a-form>
        </div>
      </a-space>
    </a-drawer>

    <a-drawer :width="430" :open="Boolean(viewingLead)" @close="viewingLead = null" title="游客线索">
      <a-space v-if="viewingLead" direction="vertical" :size="16" class="full-width">
        <a-tag :color="leadStatusColor[viewingLead.status]">{{ leadStatusLabels[viewingLead.status] }}</a-tag>

        <a-descriptions bordered size="small" :column="1">
          <a-descriptions-item label="工单编号">
            <span class="data-value">{{ viewingLead.leadNo }}</span>
          </a-descriptions-item>
          <a-descriptions-item label="提交时间">{{ viewingLead.createdAt }}</a-descriptions-item>
        </a-descriptions>

        <a-descriptions v-if="getTreeForLead(viewingLead)" bordered size="small" :column="1">
          <a-descriptions-item label="树木编号">
            <span class="data-value">{{ getTreeForLead(viewingLead).code }}</span>
          </a-descriptions-item>
          <a-descriptions-item label="树种">{{ getTreeForLead(viewingLead).species }}</a-descriptions-item>
        </a-descriptions>

        <div class="edit-box">
          <div class="section-title">线索信息</div>
          <a-form layout="vertical">
            <a-form-item label="问题类型">
              <a-select
                v-model:value="leadEditForm.issueType"
                :options="issueTypes.map((t) => ({ label: t, value: t }))"
              />
            </a-form-item>
            <a-form-item label="问题描述">
              <a-textarea v-model:value="leadEditForm.issueDescription" :rows="3" />
            </a-form-item>
            <a-form-item label="相对位置">
              <a-input v-model:value="leadEditForm.locationDescription" />
            </a-form-item>
            <a-form-item label="健康状态">
              <a-select
                v-model:value="leadHealthStatus"
                :options="[
                  { label: '正常', value: 'healthy' },
                  { label: '异常', value: 'problem' },
                ]"
              />
            </a-form-item>
          </a-form>
        </div>

        <div v-if="viewingLead.photos?.length" class="story-block">
          <div class="section-title">现场照片</div>
          <div class="photo-strip">
            <img v-for="photo in viewingLead.photos" :key="photo.uid" :src="photo.url" :alt="photo.name" />
          </div>
        </div>

        <a-space>
          <a-button
            type="primary"
            @click="convertLeadFromDrawer"
            :disabled="viewingLead.status !== 'new' || role !== 'inspector'"
          >
            转工单
          </a-button>
          <a-button danger @click="deleteLeadFromDrawer">删除</a-button>
        </a-space>
      </a-space>
    </a-drawer>
  </div>
</template>
