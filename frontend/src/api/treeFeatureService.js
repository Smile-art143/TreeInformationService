import { toTree, siteNameById } from "./adapters";

const FEATURE_URL = import.meta.env.VITE_TREE_FEATURE_SERVICE_URL || "";
const FEATURE_LAYER = import.meta.env.VITE_TREE_FEATURE_SERVICE_LAYER || "0";
const FEATURE_TOKEN = import.meta.env.VITE_TREE_FEATURE_SERVICE_TOKEN || "";

export function isTreeFeatureServiceConfigured() {
  return Boolean(FEATURE_URL && FEATURE_URL.trim().length > 0);
}

function normalizeLayerUrl() {
  const raw = String(FEATURE_URL).trim().replace(/\/+$/, "");
  if (/\/FeatureServer\/\d+$/.test(raw)) return raw;
  if (/\/FeatureServer$/.test(raw)) return `${raw}/${FEATURE_LAYER}`;
  return `${raw}/FeatureServer/${FEATURE_LAYER}`;
}

function withToken(url) {
  if (!FEATURE_TOKEN) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(FEATURE_TOKEN)}`;
}

function valueOf(attrs, keys, fallback = "") {
  for (const key of keys) {
    if (attrs[key] !== undefined && attrs[key] !== null) return attrs[key];
  }
  return fallback;
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

// 从多个候选字段名中读取数值；字段缺失/为空时返回 null，以便上层回退到 mock 演示值。
function readNumberField(attrs, keys) {
  const value = valueOf(attrs, keys, null);
  if (value === null || value === "") return null;
  return toNumber(value);
}

const PHYSICAL_FIELDS = [
  ["carbonStorage", ["carbon_storage", "carbonStorage"]],
  ["carbonSequestration", ["carbon_sequestration", "carbonSequestration"]],
  ["oxygenProduction", ["oxygen_production", "oxygenProduction"]],
  ["stormwaterIntercepted", ["stormwater_intercepted", "stormwaterIntercepted"]],
  ["airPollutionRemoved", ["air_pollution_removed", "airPollutionRemoved"]],
  ["energySaved", ["energy_saved", "energySaved"]],
];

const ECO_YUAN_FIELDS = [
  ["annualValueYuan", ["annual_value_yuan", "annualValueYuan"]],
  ["carbonStorageYuan", ["carbon_storage_yuan", "carbonStorageYuan"]],
  ["carbonSequestrationYuan", ["carbon_sequestration_yuan", "carbonSequestrationYuan"]],
  ["oxygenProductionYuan", ["oxygen_production_yuan", "oxygenProductionYuan"]],
  ["stormwaterInterceptionYuan", ["stormwater_interception_yuan", "stormwaterInterceptionYuan"]],
  ["airPurificationYuan", ["air_purification_yuan", "airPurificationYuan"]],
  ["energySavingYuan", ["energy_saving_yuan", "energySavingYuan"]],
];

function pickPresentFields(attrs, fieldMap) {
  const result = {};
  fieldMap.forEach(([field, keys]) => {
    const value = readNumberField(attrs, keys);
    if (value !== null) result[field] = value;
  });
  return Object.keys(result).length > 0 ? result : null;
}

function parsePhotos(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  const text = String(raw).trim();
  if (!text) return [];
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // 继续按字符串处理。
    }
  }
  if (text.includes(",") || text.startsWith("http")) {
    return text.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [text];
}

function webMercatorToWgs84(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { longitude: x, latitude: y };
  const R = 6378137;
  const longitude = (x / R) * (180 / Math.PI);
  const latitude = (Math.atan(Math.exp(y / R)) * 2 - Math.PI / 2) * (180 / Math.PI);
  return { longitude, latitude };
}

function projectGeometry(geometry) {
  const wkid = geometry?.spatialReference?.wkid;
  if (wkid === 3857 || wkid === 102100) {
    return webMercatorToWgs84(geometry.x, geometry.y);
  }
  return { longitude: geometry?.x, latitude: geometry?.y };
}

function inferSiteId(attrs, code) {
  const direct = valueOf(attrs, ["siteId", "site_id", "siteid"], "");
  if (direct) return direct;
  if (/^TDC/i.test(code || "")) return "tangdacien-temple-park";
  if (/^DX/i.test(code || "")) return "daxingshansi";
  return "";
}

function adaptFeature(feature, index, serviceWkid) {
  const attrs = feature.attributes || {};
  const code = String(valueOf(attrs, ["code", "树木编号", "ID", "id"], `TREE-${index + 1}`));
  const siteId = inferSiteId(attrs, code);
  const siteName =
    valueOf(attrs, ["siteName", "site_name", "园区显示名"], "") ||
    siteNameById(siteId);
  const treeType =
    valueOf(attrs, ["treeType", "tree_type", "树木类型", "类型"], "普通树") || "普通树";
  const geometry = feature.geometry
    ? {
        ...feature.geometry,
        spatialReference: feature.geometry.spatialReference ||
          (serviceWkid ? { wkid: serviceWkid } : undefined),
      }
    : null;
  const projected = projectGeometry(geometry);
  const longitude = toNumber(
    valueOf(attrs, ["longitude", "经度", "lng", "lon"], projected.longitude)
  );
  const latitude = toNumber(
    valueOf(attrs, ["latitude", "纬度", "lat"], projected.latitude)
  );

  return toTree({
    id: code,
    code,
    species: valueOf(attrs, ["species", "树种"], ""),
    dbh: toNumber(valueOf(attrs, ["dbh", "胸径"], 0)),
    longitude,
    latitude,
    siteId,
    siteName,
    treeType,
    isAncient: Boolean(
      valueOf(attrs, ["isAncient", "is_ancient"], treeType === "古树")
    ),
    protectionLevel: valueOf(attrs, ["protectionLevel", "protection_level", "保护等级"], "") || null,
    healthStatus: valueOf(attrs, ["healthStatus", "health_status", "健康状态"], "healthy") || "healthy",
    locationDescription:
      valueOf(attrs, ["locationDescription", "location_description", "相对位置"], "") || "",
    photos: parsePhotos(valueOf(attrs, ["photos", "树木照片", "photoUrl"], "")),
    story: valueOf(attrs, ["story", "资料卡片"], "") || "",
    remark: valueOf(attrs, ["remark", "备注"], "") || "",
    ecologicalBenefits: pickPresentFields(attrs, PHYSICAL_FIELDS),
    eco: pickPresentFields(attrs, ECO_YUAN_FIELDS),
  });
}

export async function fetchFeatureServiceTrees({ maxRecords = 10000 } = {}) {
  if (!isTreeFeatureServiceConfigured()) {
    throw new Error("未配置 VITE_TREE_FEATURE_SERVICE_URL");
  }

  const layerUrl = normalizeLayerUrl();
  const all = [];
  let offset = 0;
  const pageSize = 2000;

  while (all.length < maxRecords) {
    const params = new URLSearchParams({
      where: "1=1",
      outFields: "*",
      returnGeometry: "true",
      outSR: "4326",
      f: "json",
      resultRecordCount: String(pageSize),
      resultOffset: String(offset),
    });
    const url = withToken(`${layerUrl}/query?${params.toString()}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`树木要素服务查询失败（HTTP ${response.status}）`);
    }
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message || "树木要素服务返回错误");
    }
    const features = data.features || [];
    features.forEach((feature, index) => {
      all.push(adaptFeature(feature, offset + index, data.spatialReference?.wkid));
    });
    if (!data.exceededTransferLimit || features.length === 0) break;
    offset += features.length;
  }

  return all;
}
