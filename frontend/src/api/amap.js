// ============================================================
// 高德地图 Web 服务 API 密钥
// 请前往 https://console.amap.com/ 申请，类型选择「Web 服务」，
// 创建后复制 Key 粘贴到下面双引号之间即可。
// 未填写时，导航会降级为直线距离估算。
// ============================================================
export const AMAP_KEY = "8d79b1f4c75292ddfdec2ba9cc5dc125";

const WALKING_URL = "https://restapi.amap.com/v3/direction/walking";
const AROUND_URL = "https://restapi.amap.com/v3/place/around";
const ROAD_TYPES = "190000";
const SEARCH_RADIUS_M = 50;
const START_SNAP_OFFSET_M = 10;

// --------------------------------------------------
// 坐标转换：天地图底图 / 树木坐标均为 WGS84，高德接口输入输出为 GCJ-02
// --------------------------------------------------
const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;

function outOfChina(lng, lat) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLng(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
  return ret;
}

export function wgs84ToGcj02(lng, lat) {
  if (outOfChina(lng, lat)) return { lng, lat };
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  dLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
  return { lng: lng + dLng, lat: lat + dLat };
}

export function gcj02ToWgs84(lng, lat) {
  if (outOfChina(lng, lat)) return { lng, lat };
  const g = wgs84ToGcj02(lng, lat);
  return { lng: lng * 2 - g.lng, lat: lat * 2 - g.lat };
}

// --------------------------------------------------
// 工具函数
// --------------------------------------------------
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * PI) / 180;
  const dLng = ((lng2 - lng1) * PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * PI) / 180) * Math.cos((lat2 * PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --------------------------------------------------
// 坐标吸附到最近道路（解决自定义起点偏离道路导致规划失败的问题）
// --------------------------------------------------
export async function snapPointToRoad(lng, lat) {
  const raw = { lng: Number(lng), lat: Number(lat) };
  const gcj = wgs84ToGcj02(raw.lng, raw.lat);
  const params = new URLSearchParams({
    key: AMAP_KEY.trim(),
    location: `${gcj.lng.toFixed(6)},${gcj.lat.toFixed(6)}`,
    types: ROAD_TYPES,
    radius: String(SEARCH_RADIUS_M),
    offset: "1",
    page: "1",
  });

  try {
    const response = await fetch(`${AROUND_URL}?${params.toString()}`);
    if (!response.ok) {
      return { ...raw, apiSuccess: false, poiName: "", poiDistanceM: 0, reason: `周边搜索 HTTP ${response.status}` };
    }
    const data = await response.json();
    if (String(data.status) !== "1") {
      return { ...raw, apiSuccess: false, poiName: "", poiDistanceM: 0, reason: `高德返回 status=${data.status}` };
    }
    if (!Array.isArray(data.pois) || data.pois.length === 0) {
      return { ...raw, apiSuccess: false, poiName: "", poiDistanceM: 0, reason: `周边${SEARCH_RADIUS_M}米内未检索到道路POI` };
    }
    const poi = data.pois[0];
    const [poiLng, poiLat] = String(poi.location || "").split(",").map(Number);
    if (!Number.isFinite(poiLng) || !Number.isFinite(poiLat)) {
      return { ...raw, apiSuccess: false, poiName: "", poiDistanceM: 0, reason: "道路POI location 解析失败" };
    }
    const wgs = gcj02ToWgs84(poiLng, poiLat);
    return {
      lng: wgs.lng,
      lat: wgs.lat,
      apiSuccess: true,
      poiName: poi.name || "",
      poiDistanceM: Number(poi.distance) || 0,
      reason: "",
    };
  } catch (error) {
    return { ...raw, apiSuccess: false, poiName: "", poiDistanceM: 0, reason: error?.message || String(error) };
  }
}

// --------------------------------------------------
// 步行路径规划
// --------------------------------------------------
export function isAmapKeyConfigured() {
  return Boolean(AMAP_KEY && AMAP_KEY.trim().length > 0);
}

function parseAmapPolyline(steps) {
  const polyline = [];
  (steps || []).forEach((step) => {
    const pairs = String(step.polyline || "").split(";");
    pairs.forEach((pair) => {
      const [lng, lat] = pair.split(",").map(Number);
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        const wgs = gcj02ToWgs84(lng, lat);
        polyline.push([wgs.lng, wgs.lat]);
      }
    });
  });
  return polyline;
}

// origin / destination: { lat, lng }（WGS84）
export async function fetchAmapWalkingRoute(origin, destination) {
  const key = AMAP_KEY.trim();
  const from = wgs84ToGcj02(Number(origin.lng), Number(origin.lat));
  const to = wgs84ToGcj02(Number(destination.lng), Number(destination.lat));

  const params = new URLSearchParams({
    key,
    origin: `${from.lng.toFixed(6)},${from.lat.toFixed(6)}`,
    destination: `${to.lng.toFixed(6)},${to.lat.toFixed(6)}`,
  });

  const response = await fetch(`${WALKING_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`高德步行规划请求失败：HTTP ${response.status}`);
  }
  const data = await response.json();
  if (String(data.status) !== "1" || !data.route?.paths?.length) {
    const error = new Error(`高德步行规划失败：${data.info || "无可用路线"}`);
    error.infocode = data.infocode;
    throw error;
  }

  const path = data.route.paths[0];
  return {
    polyline: parseAmapPolyline(path.steps),
    distanceMeters: Number(path.distance),
    durationSeconds: Number(path.duration),
  };
}

// 单段降级：生成起点到终点的直线路径
function buildStraightLine(origin, destination) {
  return {
    polyline: [
      [Number(origin.lng), Number(origin.lat)],
      [Number(destination.lng), Number(destination.lat)],
    ],
    distanceMeters: haversineDistance(
      Number(origin.lat), Number(origin.lng),
      Number(destination.lat), Number(destination.lng)
    ),
    durationSeconds: 0,
    degraded: true,
  };
}

// points: 有序途经点数组 [{ lat, lng }]（WGS84），逐段串联步行规划
// 改进：仅起点道路吸附 + 串行请求（避免并发限流）+ 单段失败降级为直线
// options: { snap: boolean, delayMs: number }
export async function planAmapWalkingRoute(points, options = {}) {
  const { snap = true, delayMs = 80 } = options;

  // 仅对起点做道路吸附（解决自定义起点偏离道路导致规划失败的问题）：
  // 偏移 <= 30m 吸附到道路，否则保留原坐标；途经点与终点不吸附，直接参与规划。
  let orderedPoints = points;
  if (snap && isAmapKeyConfigured() && points.length > 0) {
    const start = points[0];
    const startLng = Number(start.lng ?? start.longitude);
    const startLat = Number(start.lat ?? start.latitude);
    const snapped = await snapPointToRoad(startLng, startLat);
    const offsetM = haversineDistance(startLat, startLng, snapped.lat, snapped.lng);
    if (snapped.apiSuccess && offsetM <= START_SNAP_OFFSET_M) {
      orderedPoints = [{ ...start, lng: snapped.lng, lat: snapped.lat }, ...points.slice(1)];
    }
  }

  // 第二步：串行逐段规划，单段失败时降级为直线连接（避免一段失败导致整条路线失败）
  const segments = [];
  for (let i = 0; i < orderedPoints.length - 1; i++) {
    const from = orderedPoints[i];
    const to = orderedPoints[i + 1];
    try {
      const route = await fetchAmapWalkingRoute(from, to);
      segments.push({ ...route, degraded: false });
    } catch (error) {
      console.warn(`[amap] 路段 ${i + 1} 规划失败，降级为直线：`, error?.message || error);
      segments.push(buildStraightLine(from, to));
    }
    if (i < orderedPoints.length - 2 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return {
    polylines: segments.map((item) => item.polyline),
    totalMeters: segments.reduce((sum, item) => sum + item.distanceMeters, 0),
    totalSeconds: segments.reduce((sum, item) => sum + item.durationSeconds, 0),
    degradedSegments: segments.filter((s) => s.degraded).length,
  };
}
