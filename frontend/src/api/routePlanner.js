import { isMockMode } from "./http";
import { findLocalRoute } from "./localRoute";
import { haversineDistance } from "./mockApi";
import { planRoute } from "./routesApi";

function resolveParkId(park, point) {
  if (park) return park;
  if (point?.siteId) return point.siteId;
  if (point?.siteName === "大兴善寺") return "daxingshansi";
  if (point?.siteName === "唐大慈恩寺遗址公园") return "tangdacien-temple-park";
  const code = String(point?.id ?? point?.code ?? "");
  if (/^(DC|TDC)/i.test(code)) return "tangdacien-temple-park";
  if (/^DX/i.test(code)) return "daxingshansi";
  return park || "";
}

function lngOf(point) {
  return Number(point?.lng ?? point?.longitude ?? point?.x);
}

function latOf(point) {
  return Number(point?.lat ?? point?.latitude ?? point?.y);
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
  return Math.round(totalMeters * 10) / 10;
}

function straightFallback(points) {
  const polyline = straightPolyline(points);
  return {
    source: "straight",
    polyline,
    polylines: [polyline],
    totalMeters: straightMetrics(points),
    durationSeconds: 0,
    orderedStops: [],
  };
}

async function backendRouteFallback(payload) {
  if (isMockMode() || !payload?.parkId) return null;
  try {
    const result = await planRoute(payload);
    const polyline = Array.isArray(result?.polyline) ? result.polyline : [];
    if (polyline.length < 2) return null;
    return {
      source: "backend",
      polyline,
      polylines: [polyline],
      totalMeters: Number(result.totalDistance ?? result.totalMeters ?? 0),
      durationSeconds: Number(
        result.durationSeconds ?? Math.round((result.estimatedMinutes || 0) * 60)
      ),
      orderedStops: result.points || [],
    };
  } catch (error) {
    console.warn("[route] 后端路线规划失败，降级本地路网：", error?.message || error);
    return null;
  }
}

// 工单导航：本地路网最短路径优先，直线距离兜底。
export async function planTreeTaskRoute({
  origin,
  destination,
  park,
} = {}) {
  const points = [origin, destination].filter(Boolean);
  if (points.length < 2) {
    throw new Error("工单导航缺少起点或终点");
  }
  const resolvedPark = resolveParkId(park, destination);
  try {
    return await findLocalRoute(resolvedPark, points);
  } catch (error) {
    console.warn("[route] 本地路网规划失败，降级直线：", error?.message || error);
  }
  return straightFallback(points);
}

// 游客路线：photo_route / season_route 共用，本地路网最短路径优先，直线兜底。
export async function planVisitorRoute({
  park,
  scenario,
  origin,
  destination,
  stops = [],
  viewingWindowId,
  orderedPoints,
} = {}) {
  const fallbackPoints = orderedPoints?.length
    ? orderedPoints
    : [origin, ...stops, destination].filter(Boolean);
  if (scenario === "season_route") {
    const backendResult = await backendRouteFallback({
      parkId: park,
      businessType: "seasonal",
      windowKey: viewingWindowId,
      start: { longitude: lngOf(origin), latitude: latOf(origin) },
    });
    if (backendResult) return backendResult;
  }
  try {
    return await findLocalRoute(park, fallbackPoints);
  } catch (error) {
    console.warn("[route] 本地路网规划失败，降级直线：", error?.message || error);
  }
  return straightFallback(fallbackPoints);
}
