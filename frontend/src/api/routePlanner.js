import { isGpRouteConfigured, planGpRoute } from "./gpRoute";
import {
  fetchAmapWalkingRoute,
  isAmapKeyConfigured,
  planAmapWalkingRoute,
} from "./amap";
import { findLocalRoute } from "./localRoute";
import { haversineDistance } from "./mockApi";

// 业务园区 id -> GP 脚本 park 枚举
const GP_PARK_MAP = {
  daxingshansi: "daxingshan",
  "tangdacien-temple-park": "cien",
};

export function toGpPark(park) {
  return GP_PARK_MAP[park] || park || "";
}

function resolveParkId(park, point) {
  if (park && GP_PARK_MAP[park]) return park;
  if (point?.siteId && GP_PARK_MAP[point.siteId]) return point.siteId;
  if (point?.siteName === "大兴善寺") return "daxingshansi";
  if (point?.siteName === "唐大慈恩寺遗址公园") return "tangdacien-temple-park";
  const code = String(point?.id ?? point?.code ?? "");
  if (/^DC/i.test(code)) return "tangdacien-temple-park";
  if (/^DX/i.test(code)) return "daxingshansi";
  return park || "";
}

function lngOf(point) {
  return Number(point?.lng ?? point?.longitude ?? point?.x);
}

function latOf(point) {
  return Number(point?.lat ?? point?.latitude ?? point?.y);
}

function toGpPoint(point) {
  return { x: lngOf(point), y: latOf(point) };
}

function toGpStop(point) {
  return {
    x: lngOf(point),
    y: latOf(point),
    stop_id: point.stop_id || point.id || `P${Date.now()}`,
    stop_name: point.stop_name || point.name || point.label || "途经点",
  };
}

function straightPolyline(points) {
  return (points || []).map((point) => [lngOf(point), latOf(point)]);
}

function straightMetrics(points) {
  let totalMeters = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    totalMeters += haversineDistance(
      latOf(points[i]),
      lngOf(points[i]),
      latOf(points[i + 1]),
      lngOf(points[i + 1])
    );
  }
  return { totalMeters: Math.round(totalMeters * 10) / 10, durationSeconds: 0 };
}

function straightFallback(points) {
  const polyline = straightPolyline(points);
  return {
    source: "straight",
    polyline,
    polylines: [polyline],
    totalMeters: straightMetrics(points).totalMeters,
    durationSeconds: 0,
    orderedStops: [],
  };
}

async function amapFallback(points) {
  if (!isAmapKeyConfigured()) return null;
  try {
    const result = await planAmapWalkingRoute(points);
    return {
      source: "amap",
      polyline: result.polylines.flat(),
      polylines: result.polylines,
      totalMeters: result.totalMeters,
      durationSeconds: result.totalSeconds,
      orderedStops: [],
    };
  } catch (error) {
    console.warn("[route] 高德步行规划失败，继续降级直线：", error?.message || error);
    return null;
  }
}

async function localRouteFallback(park, points) {
  if (!park) return null;
  try {
    return await findLocalRoute(park, points);
  } catch (error) {
    console.warn("[route] 本地路网规划失败，降级高德：", error?.message || error);
    return null;
  }
}

// 工单导航：GP 未配置时本地路网优先，高德次之，直线兜底。
export async function planTreeTaskRoute({
  origin,
  destination,
  park,
  token,
  timeoutMs,
} = {}) {
  const points = [origin, destination].filter(Boolean);
  if (points.length < 2) {
    throw new Error("工单导航缺少起点或终点");
  }
  const resolvedPark = resolveParkId(park, destination);

  if (isGpRouteConfigured()) {
    try {
      const result = await planGpRoute({
        park: toGpPark(resolvedPark),
        scenario: "tree_task",
        origin: toGpPoint(origin),
        destination: toGpPoint(destination),
        token,
        timeoutMs,
      });
      if (result.route.coordinates?.length) {
        return {
          source: "gp",
          polyline: result.route.coordinates,
          polylines: [result.route.coordinates],
          totalMeters: result.totalMeters,
          durationSeconds: Math.round((result.estimatedMinutes || 0) * 60),
          orderedStops: result.orderedStops || [],
        };
      }
    } catch (error) {
      console.warn("[route] GP 工单导航失败，降级高德：", error?.message || error);
    }
  }

  if (!isGpRouteConfigured()) {
    const localResult = await localRouteFallback(resolvedPark, points);
    if (localResult) return localResult;
  }

  if (isAmapKeyConfigured()) {
    try {
      const route = await fetchAmapWalkingRoute(
        { lat: latOf(origin), lng: lngOf(origin) },
        { lat: latOf(destination), lng: lngOf(destination) }
      );
      return {
        source: "amap",
        polyline: route.polyline,
        polylines: [route.polyline],
        totalMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
        orderedStops: [],
      };
    } catch (error) {
      console.warn("[route] 高德工单导航失败，降级直线：", error?.message || error);
    }
  }

  return straightFallback(points);
}

// 游客路线：photo_route / season_route 共用，GP 未配置时本地路网优先。
export async function planVisitorRoute({
  park,
  scenario,
  origin,
  destination,
  stops = [],
  viewingWindowId,
  orderedPoints,
  token,
  timeoutMs,
} = {}) {
  const fallbackPoints = orderedPoints?.length
    ? orderedPoints
    : [origin, ...stops, destination].filter(Boolean);

  if (isGpRouteConfigured()) {
    try {
      const result = await planGpRoute({
        park: toGpPark(park),
        scenario,
        origin: toGpPoint(origin),
        destination: toGpPoint(destination),
        stops: (stops || []).map(toGpStop),
        viewingWindowId,
        token,
        timeoutMs,
      });
      if (result.route.coordinates?.length) {
        return {
          source: "gp",
          polyline: result.route.coordinates,
          polylines: [result.route.coordinates],
          totalMeters: result.totalMeters,
          durationSeconds: Math.round((result.estimatedMinutes || 0) * 60),
          orderedStops: result.orderedStops || [],
        };
      }
    } catch (error) {
      console.warn("[route] GP 游客路线失败，降级高德：", error?.message || error);
    }
  }

  if (!isGpRouteConfigured()) {
    const localResult = await localRouteFallback(park, fallbackPoints);
    if (localResult) return localResult;
  }

  const amapResult = await amapFallback(fallbackPoints);
  if (amapResult) return amapResult;
  return straightFallback(fallbackPoints);
}
