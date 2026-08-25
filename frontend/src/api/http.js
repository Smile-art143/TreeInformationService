import axios from "axios";

export const TOKEN_KEY = "xian-tree-auth-token";
export const CURRENT_USER_KEY = "xian-tree-current-user";

function envValue(key, fallback) {
  const value = import.meta.env[key];
  return value === undefined || value === "" ? fallback : value;
}

function toBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

export const apiConfig = {
  baseURL: envValue("VITE_API_BASE_URL", "http://localhost:8000"),
  timeout: Number(envValue("VITE_API_TIMEOUT_MS", 10000)),
  useMock: toBoolean(envValue("VITE_USE_MOCK", "true"), true),
  mockFallback: toBoolean(envValue("VITE_MOCK_FALLBACK_ENABLED", "true"), true),
};

// 运行时也可用 window.__XIAN_API_CONFIG__ 覆盖，便于联调时快速切换。
if (typeof window !== "undefined" && window.__XIAN_API_CONFIG__) {
  Object.assign(apiConfig, window.__XIAN_API_CONFIG__);
}

export function isMockMode() {
  return Boolean(apiConfig.useMock);
}

export function setMockMode(value) {
  apiConfig.useMock = Boolean(value);
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setToken(token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // localStorage 不可用时忽略，登录态仅保留在内存中。
  }
}

export function getCachedUser() {
  try {
    return JSON.parse(localStorage.getItem(CURRENT_USER_KEY) || "null");
  } catch {
    return null;
  }
}

export function setCachedUser(user) {
  try {
    if (user) {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(CURRENT_USER_KEY);
    }
  } catch {
    // 同上，静默失败。
  }
}

export function clearAuth() {
  setToken("");
  setCachedUser(null);
}

export class ApiError extends Error {
  constructor(message, { code, httpStatus, data, isNetworkError = false } = {}) {
    super(message || "请求失败");
    this.name = "ApiError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.data = data;
    this.isNetworkError = isNetworkError;
  }
}

const http = axios.create({
  baseURL: apiConfig.baseURL,
  timeout: apiConfig.timeout,
  headers: {
    "Content-Type": "application/json",
  },
});

http.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function notifyUnauthorized() {
  clearAuth();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("xian:unauthorized"));
  }
}

http.interceptors.response.use(
  (response) => {
    if (response.config.responseType === "blob") {
      return response;
    }
    const payload = response.data;
    if (payload && typeof payload.code === "number") {
      if (payload.code === 0) {
        return payload.data;
      }
      if (payload.code === 40101) {
        notifyUnauthorized();
      }
      throw new ApiError(payload.message || "请求失败", {
        code: payload.code,
        httpStatus: response.status,
        data: payload.data,
      });
    }
    return payload;
  },
  (error) => {
    if (!error.response) {
      return Promise.reject(
        new ApiError("网络连接失败，请确认后端服务已启动或检查 CORS 配置", {
          isNetworkError: true,
        })
      );
    }
    const { status, data } = error.response;
    if (data && typeof data.code === "number") {
      if (data.code === 40101) {
        notifyUnauthorized();
      }
      return Promise.reject(
        new ApiError(data.message || "请求失败", {
          code: data.code,
          httpStatus: status,
          data: data.data,
        })
      );
    }
    if (status === 401) {
      notifyUnauthorized();
    }
    return Promise.reject(
      new ApiError(`请求失败（HTTP ${status}）`, { httpStatus: status })
    );
  }
);

export async function request(method, url, options = {}) {
  const response = await http.request({ method, url, ...options });
  return response;
}

// 只读接口在“真实优先 + 允许兜底”配置下，网络异常时降级到 mock；
// 写接口绝不静默降级，避免把假数据写进页面状态。
export async function withMockFallback(realCall, mockCall) {
  if (apiConfig.useMock) {
    return mockCall();
  }
  try {
    return await realCall();
  } catch (error) {
    if (apiConfig.mockFallback && error?.isNetworkError) {
      console.warn("[api] 后端请求失败，已降级使用 mock 数据：", error.message);
      return mockCall();
    }
    throw error;
  }
}

export default http;
