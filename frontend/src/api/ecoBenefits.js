export const ECO_BENEFIT_METRICS = [
  { key: "carbonStorage", label: "碳储量", unit: "kg C", includedInTotal: false },
  { key: "carbonSequestration", label: "年固碳量", unit: "kg CO2/年" },
  { key: "oxygenProduction", label: "年产氧量", unit: "kg O2/年" },
  { key: "stormwaterIntercepted", label: "年截留雨水量", unit: "L/年" },
  { key: "airPollutionRemoved", label: "年净化空气污染物量", unit: "g/年" },
  { key: "energySaved", label: "年节能", unit: "kWh/年" },
];

const TOTAL_VALUE_METRICS = ECO_BENEFIT_METRICS.filter(
  (metric) => metric.includedInTotal !== false
);

function emptyBenefits() {
  const result = { totalValueYuan: 0 };
  ECO_BENEFIT_METRICS.forEach((metric) => {
    result[metric.key] = 0;
    result[`${metric.key}ValueYuan`] = 0;
  });
  return result;
}

const BASE_DBH = 6.5;
const BASELINE = {
  carbonStorage: 18.6,
  carbonStorageValueYuan: 93.0,
  carbonSequestration: 4.68,
  carbonSequestrationValueYuan: 0.28,
  oxygenProduction: 13.65,
  oxygenProductionValueYuan: 6.83,
  stormwaterIntercepted: 120.25,
  stormwaterInterceptedValueYuan: 0.48,
  airPollutionRemoved: 58.5,
  airPollutionRemovedValueYuan: 0.44,
  energySaved: 9.75,
  energySavedValueYuan: 1.17,
};

function stableSpeciesFactor(species = "") {
  const hash = Array.from(species).reduce(
    (result, character) => (result * 31 + character.codePointAt(0)) % 997,
    17
  );
  return 0.92 + (hash % 17) / 100;
}

function roundMetric(value) {
  return Number(value.toFixed(2));
}

// 替换点：生态效益接口就绪后，将本函数替换为按 treeId 查询真实数据。
// 当前 mock 以 DX-221 的既有样例为基准，按胸径等属性生成稳定的全树演示值。
export function mockTreeEcoBenefits(tree) {
  const dbh = Number(tree?.dbh);
  if (!tree || !Number.isFinite(dbh) || dbh <= 0) return emptyBenefits();

  const isBaselineTree = tree.id === "DX-221" || tree.code === "DX-221";
  const healthFactor = tree.healthStatus === "problem"
    ? 0.82
    : tree.healthStatus === "warning" ? 0.92 : 1;
  const ancientFactor = tree.isAncient || tree.treeType === "古树" ? 1.18 : 1;
  const speciesFactor = isBaselineTree ? 1 : stableSpeciesFactor(tree.species);
  const scale = isBaselineTree
    ? 1
    : Math.pow(dbh / BASE_DBH, 1.35) * healthFactor * ancientFactor * speciesFactor;

  const carbonStorage = roundMetric(BASELINE.carbonStorage * scale);
  const carbonStorageValueYuan = roundMetric(BASELINE.carbonStorageValueYuan * scale);
  const carbonSequestration = roundMetric(BASELINE.carbonSequestration * scale);
  const carbonSequestrationValueYuan = roundMetric(BASELINE.carbonSequestrationValueYuan * scale);
  const oxygenProduction = roundMetric(BASELINE.oxygenProduction * scale);
  const oxygenProductionValueYuan = roundMetric(BASELINE.oxygenProductionValueYuan * scale);
  const stormwaterIntercepted = roundMetric(BASELINE.stormwaterIntercepted * scale);
  const stormwaterInterceptedValueYuan = roundMetric(BASELINE.stormwaterInterceptedValueYuan * scale);
  const airPollutionRemoved = roundMetric(BASELINE.airPollutionRemoved * scale);
  const airPollutionRemovedValueYuan = roundMetric(BASELINE.airPollutionRemovedValueYuan * scale);
  const energySaved = roundMetric(BASELINE.energySaved * scale);
  const energySavedValueYuan = roundMetric(BASELINE.energySavedValueYuan * scale);

  const benefits = {
    carbonStorage,
    carbonStorageValueYuan,
    carbonSequestration,
    carbonSequestrationValueYuan,
    oxygenProduction,
    oxygenProductionValueYuan,
    stormwaterIntercepted,
    stormwaterInterceptedValueYuan,
    airPollutionRemoved,
    airPollutionRemovedValueYuan,
    energySaved,
    energySavedValueYuan,
  };

  // 碳储量的货币价值单列展示，不参与单树生态价值合计。
  benefits.totalValueYuan = roundMetric(
    TOTAL_VALUE_METRICS.reduce(
      (total, metric) => total + benefits[`${metric.key}ValueYuan`],
      0
    )
  );
  return benefits;
}

export function sumEcoBenefits(trees) {
  const result = emptyBenefits();
  (trees || []).forEach((tree) => {
    const benefits = mockTreeEcoBenefits(tree);
    ECO_BENEFIT_METRICS.forEach((metric) => {
      result[metric.key] += benefits[metric.key];
      result[`${metric.key}ValueYuan`] += benefits[`${metric.key}ValueYuan`];
    });
    result.totalValueYuan += benefits.totalValueYuan;
  });

  ECO_BENEFIT_METRICS.forEach((metric) => {
    result[metric.key] = Number(result[metric.key].toFixed(2));
    result[`${metric.key}ValueYuan`] = Number(
      result[`${metric.key}ValueYuan`].toFixed(2)
    );
  });
  result.totalValueYuan = Number(result.totalValueYuan.toFixed(2));
  return result;
}
