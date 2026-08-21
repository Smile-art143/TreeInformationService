<script setup>
import { computed, onMounted, ref } from "vue";
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-vue-next";
import { message } from "ant-design-vue";
import { approveUser, getPendingUsers, rejectUser } from "../api/authApi";
import { roleLabels } from "../api/mockApi";

const users = ref([]);
const loading = ref(false);
const roleFilter = ref("all");

const rejectTarget = ref(null);
const rejectReason = ref("");
const showRejectModal = ref(false);
const isSubmitting = ref(false);

const filteredUsers = computed(() => {
  if (roleFilter.value === "all") return users.value;
  return users.value.filter((user) => user.role === roleFilter.value);
});

async function loadUsers() {
  loading.value = true;
  try {
    users.value = await getPendingUsers();
  } finally {
    loading.value = false;
  }
}

async function handleApprove(user) {
  try {
    await approveUser(user.id);
    message.success(`已通过“${user.username}”的注册申请`);
    loadUsers();
  } catch (error) {
    message.error(error.message || "操作失败");
  }
}

function openReject(user) {
  rejectTarget.value = user;
  rejectReason.value = "";
  showRejectModal.value = true;
}

async function handleReject() {
  if (!rejectReason.value.trim()) {
    message.error("请填写驳回理由");
    return;
  }
  isSubmitting.value = true;
  try {
    await rejectUser(rejectTarget.value.id, rejectReason.value.trim());
    showRejectModal.value = false;
    rejectTarget.value = null;
    message.success("已驳回该注册申请");
    loadUsers();
  } catch (error) {
    message.error(error.message || "操作失败");
  } finally {
    isSubmitting.value = false;
  }
}

onMounted(loadUsers);

const columns = [
  { title: "用户名/姓名", dataIndex: "username", width: 160 },
  { title: "账号", dataIndex: "account", width: 160 },
  { title: "申请角色", key: "role", width: 120 },
  { title: "所属单位", dataIndex: "organizationName", width: 180 },
  { title: "注册时间", dataIndex: "registeredAt", width: 180 },
  { title: "操作", key: "action", width: 180 },
];
</script>

<template>
  <div class="workbench-page">
    <div class="page-heading">
      <div>
        <h1>注册审核</h1>
        <p>审核养护人员与巡检人员的注册申请，通过后账号即可登录使用，驳回需填写理由。</p>
      </div>
    </div>

    <a-card :bordered="false" class="table-card">
      <div class="table-toolbar">
        <div class="panel-title table-title">
          <ShieldCheck :size="18" />
          <span>待审核人员列表</span>
        </div>
        <a-segmented
          :value="roleFilter"
          :options="[
            { label: '全部', value: 'all' },
            { label: '养护人员', value: 'maintenance' },
            { label: '巡检人员', value: 'inspector' },
          ]"
          @change="roleFilter = $event"
        />
      </div>

      <a-table
        row-key="id"
        :columns="columns"
        :data-source="filteredUsers"
        :loading="loading"
        :pagination="{ pageSize: 8 }"
        :scroll="{ x: 980 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'role'">
            <a-tag :color="record.role === 'inspector' ? 'purple' : 'blue'">
              {{ roleLabels[record.role] }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button size="small" type="primary" @click="handleApprove(record)">
                <CheckCircle2 :size="14" />通过
              </a-button>
              <a-button size="small" danger @click="openReject(record)">
                <XCircle :size="14" />驳回
              </a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal
      :open="showRejectModal"
      title="驳回注册申请"
      :footer="null"
      :mask-closable="false"
      @cancel="showRejectModal = false"
    >
      <template v-if="rejectTarget">
        <p class="review-reject-tip">
          驳回账号 <strong>{{ rejectTarget.account }}</strong>（{{ rejectTarget.username }}，{{ roleLabels[rejectTarget.role] }}）的注册申请？
          驳回后该账号需重新提交注册申请才能再次进入审核。
        </p>
        <a-textarea
          v-model:value="rejectReason"
          :rows="3"
          placeholder="请填写驳回理由（必填）"
        />
        <a-space style="margin-top: 16px">
          <a-button type="primary" danger :loading="isSubmitting" @click="handleReject">确认驳回</a-button>
          <a-button @click="showRejectModal = false">取消</a-button>
        </a-space>
      </template>
    </a-modal>
  </div>
</template>
