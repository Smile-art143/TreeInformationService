import { organizations, roleLabels } from "./mockApi";
import { request, withMockFallback, setToken, setCachedUser, getCachedUser, clearAuth } from "./http";
import { toUser } from "./adapters";

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
  {
    id: "user-admin",
    account: "admin",
    username: "系统管理员",
    password: "123456",
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

function storeCurrentUser(user) {
  const safe = toUser(sanitizeUser(user));
  setCachedUser(safe);
  try {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(safe));
  } catch {
    // localStorage 不可用时忽略。
  }
  return safe;
}

async function mockLogin(payload) {
  const account = payload.account?.trim();
  const user = readUsers().find((item) => item.account === account && item.role === payload.role);
  if (!user || user.password !== payload.password) {
    throw new Error("账号、密码或角色不匹配");
  }
  if (user.approvalStatus === "rejected") {
    throw new Error("该账号已被驳回，请联系管理员或重新提交注册申请");
  }
  return storeCurrentUser(user);
}

export async function login(payload) {
  return withMockFallback(
    async () => {
      const data = await request("post", "/api/login", {
        data: {
          account: payload.account?.trim(),
          password: payload.password,
          role: payload.role,
        },
      });
      setToken(data.token);
      return storeCurrentUser(data.user);
    },
    () => mockLogin(payload)
  );
}

async function mockRegister(payload) {
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
    organizationName:
      payload.role === "visitor" ? "公众访问" : organization?.label ?? payload.organizationName,
    approvalStatus: payload.role === "visitor" ? "approved" : "pending",
    registeredAt: new Date().toLocaleString("zh-CN", { hour12: false }),
  };
  writeRegisteredUser(user);
  return sanitizeUser(user);
}

export async function register(payload) {
  return withMockFallback(
    async () => {
      const data = await request("post", "/api/register", {
        data: {
          username: payload.username,
          account: payload.account,
          password: payload.password,
          role: payload.role,
          organizationId: payload.role === "visitor" ? null : payload.organizationId,
        },
      });
      return toUser(data.user || data);
    },
    () => mockRegister(payload)
  );
}

export async function getPendingUsers() {
  return withMockFallback(
    async () => {
      const data = await request("get", "/api/admin/registrations", {
        params: { pageSize: 200 },
      });
      return (data.list || []).map((user) => toUser(user));
    },
    () =>
      readUsers()
        .filter(
          (item) =>
            item.approvalStatus === "pending" &&
            (item.role === "inspector" || item.role === "maintenance")
        )
        .map(sanitizeUser)
  );
}

export async function approveUser(userId) {
  return withMockFallback(
    async () => {
      const data = await request(
        "post",
        `/api/admin/registrations/${encodeURIComponent(userId)}/approve`
      );
      return toUser(data);
    },
    () => sanitizeUser(updateStoredUser(userId, { approvalStatus: "approved" }))
  );
}

export async function rejectUser(userId, reason) {
  return withMockFallback(
    async () => {
      const data = await request(
        "post",
        `/api/admin/registrations/${encodeURIComponent(userId)}/reject`,
        { data: { reason } }
      );
      return toUser(data);
    },
    () =>
      sanitizeUser(
        updateStoredUser(userId, {
          approvalStatus: "rejected",
          rejectReason: reason,
        })
      )
  );
}

export async function getCurrentUser() {
  if (getCachedUser()) {
    return getCachedUser();
  }
  return withMockFallback(
    async () => {
      const data = await request("get", "/api/auth/me");
      return storeCurrentUser(data);
    },
    () => getCachedUser()
  );
}

export async function logout() {
  return withMockFallback(
    async () => {
      try {
        await request("post", "/api/auth/logout");
      } catch (error) {
        if (!error?.isNetworkError) {
          console.warn("[api] 退出接口调用失败，继续清理本地登录态", error.message);
        }
      }
      clearAuth();
      return null;
    },
    () => {
      clearAuth();
      return null;
    }
  );
}

export const demoAccounts = seedUsers.map((user) => ({
  account: user.account,
  password: user.password,
  role: user.role,
  roleLabel: roleLabels[user.role],
}));
