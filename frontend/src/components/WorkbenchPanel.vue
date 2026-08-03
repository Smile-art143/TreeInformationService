<script setup>
import { ref, computed } from "vue";
import { CheckCircle2, ClipboardList, Download, RotateCcw, Wrench } from "lucide-vue-next";
import { message } from "ant-design-vue";
import { findTree, maintenanceStaff, statusLabels } from "../api/mockApi";

const props = defineProps({
  role: { type: String, default: "admin" },
  workOrders: { type: Array, default: () => [] },
  selectedOrder: { type: Object, default: null },
});

const emit = defineEmits(["selectOrder", "updateOrder"]);

const statusColor = {
  reported: "orange",
  assigned: "blue",
  processing: "cyan",
  reviewing: "purple",
  closed: "green",
  reassigned: "red",
};

const statusFilter = ref("all");

const visibleOrders = computed(() => {
  if (props.role === "maintenance") {
    return props.workOrders.filter((order) => order.assigneeName);
  }
  return props.workOrders;
});

const filteredOrders = computed(() => {
  if (statusFilter.value === "all") return visibleOrders.value;
  return visibleOrders.value.filter((order) => order.status === statusFilter.value);
});

const orderStats = computed(() => {
  const acc = { reported: 0, assigned: 0, processing: 0, reviewing: 0, closed: 0, reassigned: 0 };
  props.workOrders.forEach((order) => {
    acc[order.status] = (acc[order.status] ?? 0) + 1;
  });
  return acc;
});

const selectedTree = computed(() => {
  return props.selectedOrder ? findTree(props.selectedOrder.treeId) : undefined;
});

const exportOrders = () => {
  const header = ["工单编号", "树木ID", "问题类型", "状态", "责任人", "创建时间"];
  const rows = props.workOrders.map((order) => [
    order.orderNo,
    order.treeId,
    order.issueType,
    statusLabels[order.status],
    order.assigneeName ?? "",
    order.createdAt,
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

const assignOrder = (order, assigneeId) => {
  const staff = maintenanceStaff.find((item) => item.id === assigneeId);
  if (!staff) return;
  emit("updateOrder", {
    ...order,
    status: "assigned",
    assigneeId: staff.id,
    assigneeName: staff.name,
    updatedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
  });
  message.success("已派单");
};

const markTreatment = (order, values) => {
  emit("updateOrder", {
    ...order,
    status: "reviewing",
    treatmentMeasures: values?.treatmentMeasures ?? "已完成现场处置，清理异常部位并设置继续观察标记。",
    treatmentTime: new Date().toLocaleString("zh-CN", { hour12: false }),
    treatmentPhotos: order.issuePhotos,
    updatedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
  });
  message.success("已提交复核");
};

const reviewOrder = (order, passed, values) => {
  emit("updateOrder", {
    ...order,
    status: passed ? "closed" : "reassigned",
    reviewUserName: props.role === "admin" ? "管理员" : "巡检人员",
    reviewTime: new Date().toLocaleString("zh-CN", { hour12: false }),
    reviewResult: passed ? "passed" : "rework",
    reviewComment: values?.reviewComment ?? (passed ? "处置效果达标，销号归档。" : "处置效果不足，需要重新处理。"),
    updatedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
  });
  message.success(passed ? "已复核销号" : "已退回复处理");
};

const getTreeForOrder = (order) => findTree(order.treeId);

// Use ant-design-vue slot-based table columns
const columns = [
  {
    title: "工单编号",
    dataIndex: "orderNo",
    width: 180,
  },
  {
    title: "树木",
    key: "tree",
    width: 150,
  },
  {
    title: "问题",
    dataIndex: "issueType",
    width: 110,
  },
  {
    title: "状态",
    key: "status",
    width: 110,
  },
  {
    title: "责任人",
    key: "assignee",
    width: 120,
  },
  {
    title: "操作",
    key: "action",
    width: 230,
  },
];

// Treatment form state
const treatmentForm = ref({ treatmentMeasures: "" });
</script>

<template>
  <div class="workbench-page">
    <div class="page-heading">
      <div>
        <h1>养护管理工作台</h1>
        <p>集中管理问题上报、工单派发、现场处置、复核销号和台账导出。</p>
      </div>
      <a-button @click="exportOrders"><Download :size="16" />导出工单台账</a-button>
    </div>

    <div class="workbench-stats">
      <a-card :bordered="false"><a-statistic title="待派单" :value="orderStats.reported" /></a-card>
      <a-card :bordered="false"><a-statistic title="待处置" :value="orderStats.assigned + orderStats.reassigned" /></a-card>
      <a-card :bordered="false"><a-statistic title="待复核" :value="orderStats.reviewing" /></a-card>
      <a-card :bordered="false"><a-statistic title="已归档" :value="orderStats.closed" /></a-card>
    </div>

    <a-card :bordered="false" class="table-card">
      <div class="table-toolbar">
        <div class="panel-title table-title">
          <ClipboardList :size="18" />
          <span>工单列表</span>
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

      <a-table
        row-key="id"
        :columns="columns"
        :data-source="filteredOrders"
        :pagination="{ pageSize: 8 }"
        :scroll="{ x: 880 }"
      >
        <template #bodyCell="{ column, record }">
          <!-- Order No column -->
          <template v-if="column.key === 'orderNo' || column.dataIndex === 'orderNo'">
            <span class="data-value">{{ record.orderNo }}</span>
          </template>

          <!-- Tree column -->
          <template v-else-if="column.key === 'tree'">
            <template v-if="getTreeForOrder(record)">
              <span class="data-value">{{ getTreeForOrder(record).code }}</span>
              / {{ getTreeForOrder(record).species }}
            </template>
            <span v-else class="data-value">{{ record.treeId }}</span>
          </template>

          <!-- Status column -->
          <template v-else-if="column.key === 'status'">
            <a-tag :color="statusColor[record.status]">{{ statusLabels[record.status] }}</a-tag>
          </template>

          <!-- Assignee column -->
          <template v-else-if="column.key === 'assignee'">
            {{ record.assigneeName ?? '未派单' }}
          </template>

          <!-- Action column -->
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button size="small" @click="emit('selectOrder', record)">详情</a-button>

              <a-select
                v-if="role === 'admin' && record.status === 'reported'"
                size="small"
                placeholder="派单"
                style="width: 108px"
                :options="maintenanceStaff.map((item) => ({ label: item.name, value: item.id }))"
                @change="(val) => assignOrder(record, val)"
              />

              <a-button
                v-if="role === 'maintenance' && (record.status === 'assigned' || record.status === 'reassigned')"
                size="small"
                type="primary"
                @click="markTreatment(record)"
              >
                <Wrench :size="14" />处置
              </a-button>

              <a-button
                v-if="(role === 'admin' || role === 'inspector') && record.status === 'reviewing'"
                size="small"
                type="primary"
                @click="reviewOrder(record, true)"
              >
                <CheckCircle2 :size="14" />销号
              </a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- Order Detail Drawer -->
    <a-drawer
      :width="440"
      :open="Boolean(selectedOrder)"
      @close="emit('selectOrder', null)"
      title="工单详情"
    >
      <a-space v-if="selectedOrder" direction="vertical" :size="16" class="full-width">
        <a-tag :color="statusColor[selectedOrder.status]">{{ statusLabels[selectedOrder.status] }}</a-tag>

        <a-descriptions bordered size="small" :column="1">
          <a-descriptions-item label="工单编号">
            <span class="data-value">{{ selectedOrder.orderNo }}</span>
          </a-descriptions-item>
          <a-descriptions-item label="问题类型">{{ selectedOrder.issueType }}</a-descriptions-item>
          <a-descriptions-item label="问题描述">{{ selectedOrder.issueDescription }}</a-descriptions-item>
          <a-descriptions-item label="上报人">{{ selectedOrder.reporterName }}</a-descriptions-item>
          <a-descriptions-item label="创建时间">{{ selectedOrder.createdAt }}</a-descriptions-item>
          <a-descriptions-item label="责任人">{{ selectedOrder.assigneeName ?? '未派单' }}</a-descriptions-item>
        </a-descriptions>

        <a-descriptions v-if="selectedTree" bordered size="small" :column="1">
          <a-descriptions-item label="树木编号">
            <span class="data-value">{{ selectedTree.code }}</span>
          </a-descriptions-item>
          <a-descriptions-item label="树种">{{ selectedTree.species }}</a-descriptions-item>
          <a-descriptions-item label="坐标">
            <span class="data-value">{{ selectedTree.longitude.toFixed(6) }}, {{ selectedTree.latitude.toFixed(6) }}</span>
          </a-descriptions-item>
          <a-descriptions-item label="相对位置">{{ selectedTree.locationDescription }}</a-descriptions-item>
        </a-descriptions>

        <div v-if="selectedOrder.treatmentMeasures" class="story-block">
          <div class="section-title">处置反馈</div>
          <p>{{ selectedOrder.treatmentMeasures }}</p>
        </div>

        <div v-if="selectedOrder.reviewComment" class="story-block">
          <div class="section-title">复核意见</div>
          <p>{{ selectedOrder.reviewComment }}</p>
        </div>

        <!-- Treatment Form -->
        <div
          v-if="role === 'maintenance' && (selectedOrder.status === 'assigned' || selectedOrder.status === 'reassigned')"
          class="edit-box"
        >
          <div class="section-title"><Wrench :size="16" />处置反馈</div>
          <a-form layout="vertical" @finish="(values) => markTreatment(selectedOrder, values)">
            <a-form-item label="处置措施" required>
              <a-textarea v-model:value="treatmentForm.treatmentMeasures" :rows="4" placeholder="填写修剪、清理、支撑、病虫害处理等措施" />
            </a-form-item>
            <a-upload :before-upload="() => false" :max-count="3">
              <a-button>添加处置照片</a-button>
            </a-upload>
            <a-button class="submit-report" type="primary" html-type="submit">
              <Wrench :size="16" />提交复核
            </a-button>
          </a-form>
        </div>

        <!-- Review Form -->
        <div
          v-if="(role === 'admin' || role === 'inspector') && selectedOrder.status === 'reviewing'"
          class="edit-box"
        >
          <div class="section-title"><CheckCircle2 :size="16" />复核处理</div>
          <a-form layout="vertical">
            <a-form-item label="复核意见">
              <a-textarea :rows="3" placeholder="填写复核意见" />
            </a-form-item>
            <a-space wrap>
              <a-button type="primary" @click="reviewOrder(selectedOrder, true)">通过并销号</a-button>
              <a-button danger @click="reviewOrder(selectedOrder, false)">退回复处理</a-button>
            </a-space>
          </a-form>
        </div>
      </a-space>
    </a-drawer>
  </div>
</template>
