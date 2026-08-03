import rawTrees from "../data/trees.json";

export const trees = rawTrees;

export const roleLabels = {
  visitor: "游客",
  admin: "管理员",
  inspector: "巡检人员",
  maintenance: "养护人员",
};

export const statusLabels = {
  reported: "待派单",
  assigned: "待处置",
  processing: "处理中",
  reviewing: "待复核",
  closed: "已归档",
  reassigned: "需返工",
};

export const issueTypes = ["病虫害", "倾斜", "枯枝", "根系隆起", "树皮损伤", "长势异常"];

export const maintenanceStaff = [
  { id: "m-001", name: "养护一组" },
  { id: "m-002", name: "养护二组" },
  { id: "m-003", name: "古树专项组" },
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

export function createInitialWorkOrders(list) {
  const candidates = list.filter((tree) => tree.healthStatus !== "healthy").slice(0, 8);
  return candidates.map((tree, index) => ({
    id: `wo-${index + 1}`,
    orderNo: `WO-20260728-${String(index + 1).padStart(3, "0")}`,
    treeId: tree.id,
    status: index % 3 === 0 ? "reported" : index % 3 === 1 ? "assigned" : "reviewing",
    issueType: issueTypes[index % issueTypes.length],
    issueDescription: `${tree.species}存在现场巡查记录，需要养护人员进一步确认。`,
    issuePhotos: tree.photos,
    reporterRole: index % 2 === 0 ? "inspector" : "visitor",
    reporterName: index % 2 === 0 ? "巡检人员" : "游客反馈",
    reportChannel: index % 2 === 0 ? "inspection" : "visitor",
    assigneeId: index % 3 === 0 ? undefined : maintenanceStaff[index % maintenanceStaff.length].id,
    assigneeName: index % 3 === 0 ? undefined : maintenanceStaff[index % maintenanceStaff.length].name,
    treatmentPhotos: index % 3 === 2 ? tree.photos : [],
    treatmentMeasures: index % 3 === 2 ? "已完成现场清理并设置继续观察标记。" : undefined,
    treatmentTime: index % 3 === 2 ? "2026-07-28 15:30" : undefined,
    createdAt: "2026-07-28 10:00",
    updatedAt: "2026-07-28 15:30",
  }));
}

export function findTree(treeId) {
  return trees.find((tree) => tree.id === treeId);
}
