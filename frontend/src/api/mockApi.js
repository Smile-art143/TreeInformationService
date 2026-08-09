import rawTrees from "../data/trees.json";

export const trees = rawTrees;

export const roleLabels = {
  visitor: "游客",
  inspector: "巡检人员",
  maintenance: "养护人员",
};

export const statusLabels = {
  created: "已创建",
  processing: "待处置",
  reviewing: "待复核",
  archived: "已归档",
};

export const leadStatusLabels = {
  new: "新线索",
  converted: "已转工单",
};

export const healthLabels = {
  healthy: "正常",
  problem: "异常",
  warning: "待观察",
};

export const healthOptions = [
  { label: "正常", value: "healthy" },
  { label: "异常", value: "problem" },
  { label: "待观察", value: "warning" },
];

export const issueTypes = ["病虫害", "倾斜", "枯枝", "根系隆起", "树皮损伤", "长势异常"];

export const organizations = [
  { label: "公众访问", value: "public" },
  { label: "大兴善寺", value: "daxingshansi" },
  { label: "唐大慈恩寺遗址公园", value: "tangdacien-temple-park" },
];

export const speciesPalette = [
  "#2F7D32",
  "#5C8F22",
  "#00897B",
  "#7A8A14",
  "#4B7F52",
  "#B5791E",
  "#A84E2A",
  "#426B8F",
  "#8E6D3F",
  "#5E7252",
  "#A65F5B",
  "#6E7B2C",
];

export const topSpeciesColorLimit = 12;
export const otherSpeciesColor = "#8A9A82";

export function getSpeciesColorMap(list) {
  const counts = new Map();
  list.forEach((tree) => {
    counts.set(tree.species, (counts.get(tree.species) ?? 0) + 1);
  });

  const rankedSpecies = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0], "zh-Hans-CN");
  });
  const topSpecies = new Set(rankedSpecies.slice(0, topSpeciesColorLimit).map(([name]) => name));

  const result = {};
  rankedSpecies.forEach(([name], index) => {
    result[name] = topSpecies.has(name) ? speciesPalette[index] : otherSpeciesColor;
  });
  return result;
}

export function getDbhSize(dbh) {
  if (dbh >= 80) return 20;
  if (dbh >= 50) return 16;
  if (dbh >= 30) return 12;
  if (dbh >= 15) return 9;
  return 7;
}

export function computeNextTreeCode(trees) {
  let maxNum = 0;
  let prefix = "DX";
  trees.forEach((tree) => {
    const match = tree.id && tree.id.match(/^([A-Z]+)-(\d+)$/);
    if (match) {
      const num = parseInt(match[2], 10);
      if (num > maxNum) {
        maxNum = num;
        prefix = match[1];
      }
    }
  });
  return `${prefix}-${maxNum + 1}`;
}

export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function fetchNearbyTreesMock(trees, lat, lon, radiusM) {
  return new Promise((resolve) => {
    const delay = 300 + Math.random() * 500;
    setTimeout(() => {
      resolve(findNearbyTrees(trees, lat, lon, radiusM));
    }, delay);
  });
}

export function findNearbyTrees(trees, lat, lon, radiusM) {
  return trees
    .filter((tree) => {
      if (tree.latitude == null || tree.longitude == null) return false;
      const dist = haversineDistance(lat, lon, tree.latitude, tree.longitude);
      return dist <= radiusM;
    })
    .map((tree) => {
      const distance = haversineDistance(lat, lon, tree.latitude, tree.longitude);
      return { ...tree, distance: Math.round(distance * 10) / 10 };
    })
    .sort((a, b) => a.distance - b.distance);
}

export function calculateBearing(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
}

export function bearingToText(degrees) {
  const d = ((degrees % 360) + 360) % 360;
  const compass = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
  const idx = Math.round(d / 45) % 8;
  const cardinalCenter = idx * 45;
  const diff = Math.round(d - cardinalCenter);

  if (Math.abs(diff) < 5) return compass[idx];

  if (diff > 0) {
    return `${compass[idx]}偏右${Math.abs(diff)}°`;
  } else {
    return `${compass[idx]}偏左${Math.abs(diff)}°`;
  }
}

export function getPendingOrdersForRole(workOrders, role) {
  const status = role === "maintenance" ? "processing" : "reviewing";
  return workOrders.filter((o) => o.status === status);
}

export function buildStats(list) {
  const speciesMap = new Map();
  const siteSpeciesMap = new Map();
  const dbhBuckets = [
    { range: "0-15", min: 0, max: 15, count: 0 },
    { range: "15-30", min: 15, max: 30, count: 0 },
    { range: "30-50", min: 30, max: 50, count: 0 },
    { range: "50-80", min: 50, max: 80, count: 0 },
    { range: "80+", min: 80, max: Number.POSITIVE_INFINITY, count: 0 },
  ];

  list.forEach((tree) => {
    speciesMap.set(tree.species, (speciesMap.get(tree.species) ?? 0) + 1);
    const key = `${tree.siteId}|${tree.siteName}|${tree.species}`;
    siteSpeciesMap.set(key, (siteSpeciesMap.get(key) ?? 0) + 1);
    const bucket = dbhBuckets.find((item) => tree.dbh >= item.min && tree.dbh < item.max);
    if (bucket) bucket.count += 1;
  });

  const speciesRatio = Array.from(speciesMap.entries())
    .map(([species, count]) => ({
      species,
      count,
      percentage: list.length ? Number(((count / list.length) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalTrees: list.length,
    speciesCount: speciesMap.size,
    speciesRatio,
    dbhDistribution: dbhBuckets.map(({ range, count }) => ({ range, count })),
    siteComparison: Array.from(siteSpeciesMap.entries()).map(([key, count]) => {
      const [siteId, siteName, species] = key.split("|");
      return { siteId, siteName, species, count };
    }),
    ecologicalBenefits: {
      carbonStorage: Math.round(list.reduce((sum, tree) => sum + tree.dbh * 11.6, 0)),
      carbonSequestration: Math.round(list.reduce((sum, tree) => sum + tree.dbh * 0.72, 0)),
      oxygenProduction: Math.round(list.reduce((sum, tree) => sum + tree.dbh * 2.1, 0)),
      stormwaterIntercepted: Math.round(list.reduce((sum, tree) => sum + tree.dbh * 18.5, 0)),
      airPollutionRemoved: Math.round(list.reduce((sum, tree) => sum + tree.dbh * 0.09, 0)),
    },
  };
}

function createPhotoRecord(url, name = "现场照片") {
  return {
    uid: `${name}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name,
    url,
  };
}

export function createInitialWorkOrders(list) {
  const candidates = list.filter((tree) => tree.healthStatus !== "healthy").slice(0, 8);
  return candidates.map((tree, index) => {
    const isReviewing = index % 3 === 1;
    const isArchived = index % 3 === 2;
    const createdAt = "2026-07-28 10:00";
    const processedAt = isReviewing || isArchived ? "2026-07-28 15:30" : undefined;
    const reviewedAt = isArchived ? "2026-07-28 16:30" : undefined;
    return {
      id: `wo-${index + 1}`,
      orderNo: `WO-20260728-${String(index + 1).padStart(3, "0")}`,
      treeId: tree.id,
      status: isArchived ? "archived" : isReviewing ? "reviewing" : "processing",
      issueType: issueTypes[index % issueTypes.length],
      issueDescription: `${tree.species}存在现场巡查记录，需要养护人员进一步确认。`,
      creatorRole: index % 2 === 0 ? "inspector" : "maintenance",
      creatorName: index % 2 === 0 ? "巡检员小王" : "养护员老李",
      createPhotos: tree.photos.slice(0, 1).map((url) => createPhotoRecord(url, "创建照片")),
      treatmentMeasures: processedAt ? "已完成现场清理并设置继续观察标记。" : undefined,
      handlerName: processedAt ? "养护员老李" : undefined,
      treatmentPhotos: processedAt ? tree.photos.slice(0, 1).map((url) => createPhotoRecord(url, "处置照片")) : [],
      reviewerName: reviewedAt ? "巡检员小王" : undefined,
      reviewResult: reviewedAt ? "passed" : undefined,
      reviewComment: reviewedAt ? "处置效果达标，归档。" : undefined,
      createdAt,
      processedAt,
      reviewedAt,
      archivedAt: reviewedAt,
      updatedAt: reviewedAt ?? processedAt ?? createdAt,
    };
  });
}

export function createInitialVisitorLeads(list) {
  return list
    .filter((tree) => tree.healthStatus !== "healthy")
    .slice(8, 12)
    .map((tree, index) => ({
      id: `lead-${index + 1}`,
      leadNo: `LEAD-20260728-${String(index + 1).padStart(3, "0")}`,
      treeId: tree.id,
      status: "new",
      issueType: issueTypes[(index + 2) % issueTypes.length],
      issueDescription: `游客反馈${tree.species}附近存在异常现象，请巡检人员确认。`,
      locationDescription: tree.locationDescription,
      photos: tree.photos.slice(0, 1).map((url) => createPhotoRecord(url, "游客线索照片")),
      createdAt: "2026-07-28 11:20",
      convertedAt: undefined,
      convertedOrderId: undefined,
    }));
}

export function findTree(treeId) {
  return trees.find((tree) => tree.id === treeId);
}
