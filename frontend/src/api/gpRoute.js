// GeoScene GP 路径规划客户端
// 服务形态：submitJob 异步提交 -> 轮询 jobStatus -> 按结果参数拉取结果。
// 对应 ParkRoutePlanning.pyt：park/scenario/origin/destination/stops/
// viewing_window_id/snap_tolerance_m，坐标统一 EPSG:4490。

const GP_ROUTE_URL = import.meta.env.VITE_GP_ROUTE_URL || "";
const GP_ROUTE_TOKEN = import.meta.env.VITE_GP_ROUTE_TOKEN || "";
const POLL_INTERVAL_MS = Number(import.meta.env.VITE_GP_ROUTE_POLL_INTERVAL_MS || 1200);
const TIMEOUT_MS = Number(import.meta.env.VITE_GP_ROUTE_TIMEOUT_MS || 30000);

export class GpRouteError extends Error {
  constructor(message, { code, jobId, details } = {}) {
    super(message || "路径规划失败");
    this.name = "GpRouteError";
    this.code = code;
    this.jobId = jobId;
    this.details = details;
  }
}

export function isGpRouteConfigured() {
  return Boolean(GP_ROUTE_URL && GP_ROUTE_URL.trim().length > 0);
}

function encodeParams(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, typeof value === "string" ? value : JSON.stringify(value));
  });
  return search;
}

function serviceUrl() {
  return GP_ROUTE_URL.replace(/\/$/, "");
}

function withToken(url, token = GP_ROUTE_TOKEN) {
  if (!token) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

export async function fetchGpServiceInfo(token) {
  const url = withToken(`${serviceUrl()}?f=json`, token);
  const response = await fetch(url);
  if (!response.ok) {
    throw new GpRouteError(`GP 服务信息请求失败（HTTP ${response.status}）`);
  }
  const data = await response.json();
  if (data.error) {
    throw new GpRouteError(data.error.message || "GP 服务返回错误", {
      code: data.error.code,
      details: data.error.details,
    });
  }
  return data;
}

// points: [{ x/lng, y/lat, stop_id, stop_name, ...attributes }]
export function buildFeatureSet(points = [], wkid = 4490) {
  return {
    spatialReference: { wkid },
    features: (points || []).map((point) => ({
      geometry: {
        x: Number(point.x ?? point.lng ?? point.longitude),
        y: Number(point.y ?? point.lat ?? point.latitude),
      },
      attributes: {
        stop_id: point.stop_id,
        stop_name: point.stop_name,
        ...(point.attributes || {}),
      },
    })),
  };
}

export async function submitGpRouteJob({
  park,
  scenario,
  origin,
  destination,
  stops,
  viewingWindowId,
  snapToleranceM = 50,
  token,
} = {}) {
  if (!isGpRouteConfigured()) {
    throw new GpRouteError("未配置 VITE_GP_ROUTE_URL，无法调用 GP 路径规划");
  }
  if (!park || !scenario || !origin || !destination) {
    throw new GpRouteError("GP 路径规划缺少 park/scenario/origin/destination 参数");
  }
  if (scenario === "season_route" && !viewingWindowId) {
    throw new GpRouteError("season_route 场景必须提供 viewing_window_id");
  }

  const params = encodeParams({
    f: "json",
    park,
    scenario,
    origin: buildFeatureSet([origin]),
    destination: buildFeatureSet([destination]),
    stops: stops?.length ? buildFeatureSet(stops) : "",
    viewing_window_id: viewingWindowId,
    snap_tolerance_m: String(snapToleranceM),
    "env:outSR": "4490",
  });
  const url = withToken(`${serviceUrl()}/submitJob`, token);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!response.ok) {
    throw new GpRouteError(`GP submitJob 请求失败（HTTP ${response.status}）`);
  }
  const data = await response.json();
  if (data.error) {
    throw new GpRouteError(data.error.message || "GP submitJob 返回错误", {
      code: data.error.code,
      details: data.error.details,
    });
  }
  if (!data.jobId) {
    throw new GpRouteError("GP submitJob 未返回 jobId");
  }
  return data.jobId;
}

export async function getGpJobStatus(jobId, token) {
  const url = withToken(
    `${serviceUrl()}/jobs/${encodeURIComponent(jobId)}?f=json&returnMessages=true`,
    token
  );
  const response = await fetch(url);
  if (!response.ok) {
    throw new GpRouteError(`GP 任务状态查询失败（HTTP ${response.status}）`, { jobId });
  }
  const data = await response.json();
  if (data.error) {
    throw new GpRouteError(data.error.message || "GP 任务状态查询失败", {
      code: data.error.code,
      jobId,
      details: data.error.details,
    });
  }
  return data;
}

export async function getGpJobResult(jobId, paramName, token) {
  const search = new URLSearchParams({ f: "json", "env:outSR": "4490" });
  const url = withToken(
    `${serviceUrl()}/jobs/${encodeURIComponent(jobId)}/results/${encodeURIComponent(paramName)}?${search.toString()}`,
    token
  );
  const response = await fetch(url);
  if (!response.ok) {
    throw new GpRouteError(`GP 结果 ${paramName} 拉取失败（HTTP ${response.status}）`, {
      jobId,
    });
  }
  const data = await response.json();
  if (data.error) {
    throw new GpRouteError(data.error.message || `GP 结果 ${paramName} 拉取失败`, {
      code: data.error.code,
      jobId,
      details: data.error.details,
    });
  }
  return data;
}

function parseRouteValue(value) {
  const features = value?.features || [];
  if (!features.length) return { coordinates: [], features: [] };
  const geometry = features[0].geometry || {};
  const paths = geometry.paths || geometry.coordinates || [];
  const coordinates = Array.isArray(paths[0]) && Array.isArray(paths[0][0])
    ? paths[0]
    : paths;
  return { coordinates, features };
}

function parseNumberResult(data) {
  const value = data?.value;
  if (typeof value === "number") return value;
  if (value && typeof value.value === "number") return value.value;
  return Number(value) || 0;
}

function parseOrderedStops(data) {
  const value = data?.value || {};
  const features = value.features || [];
  return features.map((feature) => feature.attributes || {}).filter(Boolean);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function planGpRoute({
  park,
  scenario,
  origin,
  destination,
  stops,
  viewingWindowId,
  snapToleranceM = 50,
  token,
  onProgress,
  timeoutMs = TIMEOUT_MS,
} = {}) {
  const jobId = await submitGpRouteJob({
    park,
    scenario,
    origin,
    destination,
    stops,
    viewingWindowId,
    snapToleranceM,
    token,
  });

  const startedAt = Date.now();
  let job;
  while (Date.now() - startedAt < timeoutMs) {
    job = await getGpJobStatus(jobId, token);
    const status = job.jobStatus || job.status;
    if (onProgress) onProgress({ jobId, status, messages: job.messages || [] });
    if (status === "esriJobSucceeded" || status === "esriJobSucceededWithErrors") {
      const [route, total, minutes, order, statusResult] = await Promise.all([
        getGpJobResult(jobId, "route", token),
        getGpJobResult(jobId, "total_meters", token),
        getGpJobResult(jobId, "estimated_minutes", token),
        getGpJobResult(jobId, "ordered_stops", token),
        getGpJobResult(jobId, "status", token).catch(() => null),
      ]);
      const statusText = statusResult?.value || "success";
      if (statusText !== "success") {
        throw new GpRouteError(`路径规划失败：${statusText}`, {
          code: statusText,
          jobId,
        });
      }
      return {
        jobId,
        status: statusText,
        route: parseRouteValue(route?.value),
        totalMeters: parseNumberResult(total),
        estimatedMinutes: parseNumberResult(minutes),
        orderedStops: parseOrderedStops(order),
        messages: job.messages || [],
      };
    }
    if (status === "esriJobFailed" || status === "esriJobCancelled" || status === "esriJobTimedOut") {
      const errorMessage = (job.messages || [])
        .map((item) => item.description || item.message || "")
        .filter(Boolean)
        .join("；");
      throw new GpRouteError(errorMessage || `GP 任务未成功（${status}）`, {
        code: status,
        jobId,
      });
    }
    await wait(POLL_INTERVAL_MS);
  }

  throw new GpRouteError(`GP 路径规划超时（超过 ${timeoutMs}ms）`, { jobId });
}
