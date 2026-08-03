<script setup>
import { ref, computed } from "vue";
import {
  Building2, ClipboardList, MapPinned, ShieldCheck, Trees, UserRound
} from "lucide-vue-next";
import { roleLabels } from "../api/mockApi";

const props = defineProps({
  initialRole: { type: String, default: "admin" },
});

const emit = defineEmits(["enter"]);

const roleCards = [
  { role: "visitor", title: "游客入口", description: "查看树木地图、上传照片、上报问题、浏览导览路线。" },
  { role: "admin", title: "管理员入口", description: "维护树木档案、查看统计、派发工单、导出数据。" },
  { role: "inspector", title: "巡检入口", description: "巡查树木状态、上报问题、复核养护处置效果。" },
  { role: "maintenance", title: "养护入口", description: "查看分配工单、现场处置、上传反馈和照片。" },
];

const organizations = [
  { label: "大兴善寺管理处", value: "daxingshansi" },
  { label: "西安市园林养护一组", value: "garden-team-1" },
  { label: "古树名木专项组", value: "ancient-tree-team" },
];

const roleIcon = (role) => {
  switch (role) {
    case "visitor": return UserRound;
    case "admin": return ShieldCheck;
    case "inspector": return MapPinned;
    case "maintenance": return ClipboardList;
    default: return UserRound;
  }
};

const selectedRole = ref(props.initialRole);
const selectedOrg = ref("daxingshansi");

const requiresOrg = computed(() => selectedRole.value !== "visitor");

const submit = () => {
  const organization = organizations.find((item) => item.value === selectedOrg.value);
  emit("enter", {
    role: selectedRole.value,
    organizationId: selectedOrg.value,
    organizationName: organization?.label,
  });
};
</script>

<template>
  <main class="login-page">
    <!-- Hero Section -->
    <section class="login-hero">
      <div class="login-brand">
        <div class="brand-mark login-brand-mark">
          <Trees :size="26" />
        </div>
        <div>
          <div class="login-kicker">Xi'an Urban Tree Map</div>
          <h1>西安城市树木信息服务平台</h1>
        </div>
      </div>
      <p>面向公众导览、树木档案管理和养护工单协同的城市绿化服务平台。</p>
      <div class="login-metrics">
        <div>
          <strong>437</strong>
          <span>采集树木</span>
        </div>
        <div>
          <strong>4</strong>
          <span>角色入口</span>
        </div>
        <div>
          <strong>24h</strong>
          <span>服务响应</span>
        </div>
      </div>
    </section>

    <!-- Login Card -->
    <a-card class="login-card" :bordered="false">
      <div class="login-card-heading">
        <a-tag color="green">身份入口</a-tag>
        <h2>选择身份进入系统</h2>
        <p>请选择与当前工作场景匹配的身份，进入对应的地图、导览和养护管理功能。</p>
      </div>

      <a-form layout="vertical">
        <a-form-item label="身份">
          <a-radio-group v-model:value="selectedRole" class="role-card-group">
            <a-radio-button
              v-for="item in roleCards"
              :key="item.role"
              :value="item.role"
              class="role-card-option"
            >
              <div class="role-card-icon">
                <component :is="roleIcon(item.role)" :size="18" />
              </div>
              <div>
                <strong>{{ item.title }}</strong>
                <span>{{ item.description }}</span>
              </div>
            </a-radio-button>
          </a-radio-group>
        </a-form-item>

        <a-form-item
          v-if="requiresOrg"
          label="工作单位"
        >
          <a-select
            v-model:value="selectedOrg"
            size="large"
            :options="organizations"
            placeholder="选择工作单位"
          />
        </a-form-item>

        <a-space class="login-actions">
          <a-button type="primary" size="large" @click="submit">
            进入系统
          </a-button>
          <span>当前将以"{{ roleLabels[selectedRole] }}"身份进入</span>
        </a-space>
      </a-form>
    </a-card>
  </main>
</template>
