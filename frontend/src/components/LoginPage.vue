<script setup>
import { computed, ref } from "vue";
import {
  Building2, ClipboardList, LockKeyhole, MapPinned, ShieldCheck, Trees, UserRound
} from "lucide-vue-next";
import { message } from "ant-design-vue";
import { demoAccounts, login, register } from "../api/authApi";
import { organizations, roleLabels } from "../api/mockApi";

const props = defineProps({
  initialRole: { type: String, default: "inspector" },
  mobile: { type: Boolean, default: false },
});

const emit = defineEmits(["enter"]);

const activeTab = ref("login");
const isSubmitting = ref(false);

// 登录角色：包含预置管理员角色；注册角色：管理员不开放注册
// 移动端不提供管理员入口，仅保留游客/巡检/养护三类身份。
const loginRoleCards = computed(() => {
  const cards = [
    { role: "visitor", title: "游客" },
    { role: "inspector", title: "巡检人员" },
    { role: "maintenance", title: "养护人员" },
    { role: "admin", title: "管理员" },
  ];
  return props.mobile ? cards.filter((item) => item.role !== "admin") : cards;
});

// 移动端同样隐藏管理员演示账号，与登录角色卡片保持一致。
const demoAccountList = computed(() =>
  props.mobile ? demoAccounts.filter((item) => item.role !== "admin") : demoAccounts
);

const registerRoleCards = [
  { role: "visitor", title: "游客" },
  { role: "inspector", title: "巡检人员" },
  { role: "maintenance", title: "养护人员" },
];

const orgOptions = organizations.filter((item) => item.value !== "public");

const loginForm = ref({
  account: "inspector",
  password: "123456",
  role: props.initialRole,
});

const registerForm = ref({
  account: "",
  username: "",
  password: "",
  confirmPassword: "",
  role: "visitor",
  organizationId: undefined,
});

const registerNeedsOrg = computed(() => registerForm.value.role !== "visitor");

const roleIcon = (role) => {
  switch (role) {
    case "visitor": return UserRound;
    case "inspector": return MapPinned;
    case "maintenance": return ClipboardList;
    case "admin": return ShieldCheck;
    default: return UserRound;
  }
};

const submitLogin = async () => {
  if (!loginForm.value.account || !loginForm.value.password || !loginForm.value.role) {
    message.error("请填写账号、密码并选择角色");
    return;
  }

  isSubmitting.value = true;
  try {
    const user = await login(loginForm.value);
    emit("enter", user);
  } catch (error) {
    message.error(error.message || "登录失败");
  } finally {
    isSubmitting.value = false;
  }
};

const submitRegister = async () => {
  if (!registerForm.value.account || !registerForm.value.username || !registerForm.value.password || !registerForm.value.role) {
    message.error("请填写账号、用户名/姓名、密码并选择角色");
    return;
  }
  if (registerForm.value.password !== registerForm.value.confirmPassword) {
    message.error("两次输入的密码不一致");
    return;
  }
  if (registerNeedsOrg.value && !registerForm.value.organizationId) {
    message.error("养护人员和巡检人员注册时必须选择工作单位");
    return;
  }

  isSubmitting.value = true;
  try {
    const user = await register(registerForm.value);
    loginForm.value = {
      account: user.account,
      password: registerForm.value.password,
      role: user.role,
    };
    registerForm.value = {
      account: "",
      username: "",
      password: "",
      confirmPassword: "",
      role: "visitor",
      organizationId: undefined,
    };
    activeTab.value = "login";
    message.success(user.approvalStatus === "pending" ? "账号已提交，内部角色需审核；当前 mock 环境可继续登录演示。" : "注册成功，请登录");
  } catch (error) {
    message.error(error.message || "注册失败");
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <main class="login-page" :class="{ 'mobile-login-page': mobile }">
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
      <p>面向城市树木档案、地图展示与养护协同的绿化服务平台。</p>
      <div class="login-metrics">
        <div><strong>437</strong><span>采集树木</span></div>
      </div>
    </section>

    <a-card class="login-card" :bordered="false">
      <div class="login-card-heading">
        <a-tag color="green">账号入口</a-tag>
        <h2>登录或注册</h2>
      </div>

      <a-tabs v-model:active-key="activeTab">
        <a-tab-pane key="login" tab="登录">
          <a-form layout="vertical" @finish="submitLogin">
            <a-form-item label="账号" required>
              <a-input v-model:value="loginForm.account" placeholder="例如 inspector / maintenance / visitor">
                <template #prefix><UserRound :size="15" /></template>
              </a-input>
            </a-form-item>
            <a-form-item label="密码" required>
              <a-input-password v-model:value="loginForm.password" placeholder="演示密码 123456">
                <template #prefix><LockKeyhole :size="15" /></template>
              </a-input-password>
            </a-form-item>
            <a-form-item label="登录角色" required>
              <a-radio-group v-model:value="loginForm.role" class="role-card-group compact">
                <a-radio-button v-for="item in loginRoleCards" :key="item.role" :value="item.role" class="role-card-option">
                  <div class="role-card-icon">
                    <component :is="roleIcon(item.role)" :size="18" />
                  </div>
                  <div>
                    <strong>{{ item.title }}</strong>
                  </div>
                </a-radio-button>
              </a-radio-group>
            </a-form-item>
            <a-alert type="info" show-icon :message="`当前将以“${roleLabels[loginForm.role]}”身份进入`" />
            <a-button class="submit-report" type="primary" size="large" html-type="submit" :loading="isSubmitting" @click="submitLogin">
              登录
            </a-button>
          </a-form>

          <div class="demo-account-list">
            <span>演示账号：</span>
            <button
              v-for="account in demoAccountList"
              :key="account.account"
              type="button"
              @click="loginForm = { account: account.account, password: account.password, role: account.role }"
            >
              {{ account.roleLabel }} {{ account.account }}
            </button>
          </div>
        </a-tab-pane>

        <a-tab-pane key="register" tab="注册">
          <a-form layout="vertical" @finish="submitRegister">
            <a-form-item label="账号" required>
              <a-input v-model:value="registerForm.account" placeholder="输入手机号或登录账号" />
            </a-form-item>
            <a-form-item label="用户名/姓名" required>
              <a-input v-model:value="registerForm.username" placeholder="用于工单、线索和打卡展示" />
            </a-form-item>
            <a-form-item label="密码" required>
              <a-input-password v-model:value="registerForm.password" />
            </a-form-item>
            <a-form-item label="确认密码" required>
              <a-input-password v-model:value="registerForm.confirmPassword" />
            </a-form-item>
            <a-form-item label="注册角色" required>
              <a-radio-group v-model:value="registerForm.role" class="role-card-group compact">
                <a-radio-button v-for="item in registerRoleCards" :key="item.role" :value="item.role" class="role-card-option">
                  <div class="role-card-icon">
                    <component :is="roleIcon(item.role)" :size="18" />
                  </div>
                  <div>
                    <strong>{{ item.title }}</strong>
                  </div>
                </a-radio-button>
              </a-radio-group>
            </a-form-item>
            <a-form-item v-if="registerNeedsOrg" label="工作单位" required>
              <a-select v-model:value="registerForm.organizationId" size="large" :options="orgOptions" placeholder="选择工作单位">
                <template #prefix><Building2 :size="16" /></template>
              </a-select>
            </a-form-item>
            <a-alert
              type="warning"
              show-icon
              message="内部角色注册后需审核"
              description="当前为前端 mock 演示，注册后会标注待审核，但仍可使用该账号登录演示。"
            />
            <a-button class="submit-report" type="primary" size="large" html-type="submit" :loading="isSubmitting" @click="submitRegister">
              提交注册
            </a-button>
          </a-form>
        </a-tab-pane>
      </a-tabs>
    </a-card>
  </main>
</template>
