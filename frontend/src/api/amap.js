// ============================================================
// 高德地图 Web 服务 API 密钥
// 请前往 https://console.amap.com/ 申请，类型选择「Web 服务」，
// 创建后复制 Key 粘贴到下面双引号之间即可。
// 未填写时，导航会降级为直线距离估算。
// ============================================================
export const AMAP_KEY = "8d79b1f4c75292ddfdec2ba9cc5dc125";

const WALKING_URL = "https://restapi.amap.com/v3/direction/walking";

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
    throw new Error(`高德步行规划失败：${data.info || "无可用路线"}`);
  }

  const path = data.route.paths[0];
  return {
    polyline: parseAmapPolyline(path.steps),
    distanceMeters: Number(path.distance),
    durationSeconds: Number(path.duration),
  };
}

// points: 有序途经点数组 [{ lat, lng }]（WGS84），逐段串联步行规划
export async function planAmapWalkingRoute(points) {
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push(fetchAmapWalkingRoute(points[i], points[i + 1]));
  }
  const results = await Promise.all(segments);
  return {
    polylines: results.map((item) => item.polyline),
    totalMeters: results.reduce((sum, item) => sum + item.distanceMeters, 0),
    totalSeconds: results.reduce((sum, item) => sum + item.durationSeconds, 0),
  };
}
