import { organizations, roleLabels } from "./mockApi";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const STORAGE_KEY = "xian-tree-auth-users";
const CURRENT_USER_KEY = "xian-tree-current-user";

const seedUsers = [
  {
    id: "user-visitor",
    account: "visitor",
    username: "游客小秦",
    password: "123456",
    role: "visitor",
    organizationId: "public",
    organizationName: "公众访问",
    approvalStatus: "approved",
  },
  {
    id: "user-inspector",
    account: "inspector",
    username: "巡检员小王",
    password: "123456",
    role: "inspector",
    organizationId: "daxingshansi",
    organizationName: "大兴善寺巡检组",
    approvalStatus: "approved",
  },
  {
    id: "user-maintenance",
    account: "maintenance",
    username: "养护员老李",
    password: "123456",
    role: "maintenance",
    organizationId: "daxingshansi",
    organizationName: "西安市园林养护一组",
    approvalStatus: "approved",
  },
  // 预置管理员账号（不走注册流程，初始状态即“已启用”）。
  // 实际项目中此为系统初始化账号，应提示管理员首次登录后修改默认密码。
  {
    id: "user-admin",
    account: "admin",
    username: "系统管理员",
    password: "admin123",
    role: "admin",
    organizationId: "daxingshansi",
    organizationName: "平台管理组",
    approvalStatus: "approved",
  },
];

function readUsers() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return [...seedUsers, ...stored];
  } catch {
    return seedUsers;
  }
}

function writeRegisteredUser(user) {
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  localStorage.setItem(STORAGE_KEY, JSON.stringify([user, ...stored]));
}

function readStoredUsers() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function updateStoredUser(userId, patch) {
  const next = readStoredUsers().map((item) =>
    item.id === userId ? { ...item, ...patch } : item
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next.find((item) => item.id === userId) || null;
}

function sanitizeUser(user) {
  const { password, ...rest } = user;
  return rest;
}

export async function login(payload) {
  if (API_BASE_URL) {
    // 后端接口到位后在这里替换为真实 fetch/axios 调用。
  }

  const account = payload.account?.trim();
  const user = readUsers().find((item) => item.account === account && item.role === payload.role);
  if (!user || user.password !== payload.password) {
    throw new Error("账号、密码或角色不匹配");
  }
  if (user.approvalStatus === "rejected") {
    throw new Error("该账号已被驳回，请联系管理员或重新提交注册申请");
  }

  const currentUser = sanitizeUser(user);
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));
  return currentUser;
}

export async function register(payload) {
  if (API_BASE_URL) {
    // 后端接口到位后在这里替换为真实 fetch/axios 调用。
  }

  const account = payload.account?.trim();
  const username = payload.username?.trim();
  if (!username) {
    throw new Error("请填写用户名/姓名");
  }
  if (readUsers().some((item) => item.account === account && item.role === payload.role)) {
    throw new Error("该账号在当前角色下已存在");
  }

  const organization = organizations.find((item) => item.value === payload.organizationId);
  const user = {
    id: `user-${Date.now()}`,
    account,
    username,
    password: payload.password,
    role: payload.role,
    organizationId: payload.role === "visitor" ? "public" : payload.organizationId,
    organizationName: payload.role === "visitor" ? "公众访问" : organization?.label ?? payload.organizationName,
    approvalStatus: payload.role === "visitor" ? "approved" : "pending",
    registeredAt: new Date().toLocaleString("zh-CN", { hour12: false }),
  };
  writeRegisteredUser(user);
  return sanitizeUser(user);
}

export async function getPendingUsers() {
  return readUsers()
    .filter(
      (item) =>
        item.approvalStatus === "pending" &&
        (item.role === "inspector" || item.role === "maintenance")
    )
    .map(sanitizeUser);
}

export async function approveUser(userId) {
  const updated = updateStoredUser(userId, { approvalStatus: "approved" });
  if (!updated) throw new Error("未找到该注册申请");
  return sanitizeUser(updated);
}

export async function rejectUser(userId, reason) {
  const updated = updateStoredUser(userId, {
    approvalStatus: "rejected",
    rejectReason: reason,
  });
  if (!updated) throw new Error("未找到该注册申请");
  return sanitizeUser(updated);
}

export async function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(CURRENT_USER_KEY) || "null");
  } catch {
    return null;
  }
}

export async function logout() {
  localStorage.removeItem(CURRENT_USER_KEY);
}

export const demoAccounts = seedUsers.map((user) => ({
  account: user.account,
  password: user.password,
  role: user.role,
  roleLabel: roleLabels[user.role],
}));
