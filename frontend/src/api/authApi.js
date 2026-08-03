import { organizations, roleLabels } from "./mockApi";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const STORAGE_KEY = "xian-tree-auth-users";
const CURRENT_USER_KEY = "xian-tree-current-user";

const seedUsers = [
  {
    id: "user-visitor",
    account: "visitor",
    password: "123456",
    role: "visitor",
    organizationName: "公众访问",
    approvalStatus: "approved",
  },
  {
    id: "user-inspector",
    account: "inspector",
    password: "123456",
    role: "inspector",
    organizationName: "大兴善寺巡检组",
    approvalStatus: "approved",
  },
  {
    id: "user-maintenance",
    account: "maintenance",
    password: "123456",
    role: "maintenance",
    organizationName: "西安市园林养护一组",
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

  const currentUser = sanitizeUser(user);
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));
  return currentUser;
}

export async function register(payload) {
  if (API_BASE_URL) {
    // 后端接口到位后在这里替换为真实 fetch/axios 调用。
  }

  const account = payload.account?.trim();
  if (readUsers().some((item) => item.account === account && item.role === payload.role)) {
    throw new Error("该账号在当前角色下已存在");
  }

  const organization = organizations.find((item) => item.value === payload.organizationId);
  const user = {
    id: `user-${Date.now()}`,
    account,
    password: payload.password,
    role: payload.role,
    organizationName: payload.role === "visitor" ? "公众访问" : organization?.label ?? payload.organizationName,
    approvalStatus: payload.role === "visitor" ? "approved" : "pending",
  };
  writeRegisteredUser(user);
  return sanitizeUser(user);
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
  password: "123456",
  role: user.role,
  roleLabel: roleLabels[user.role],
}));
