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

const YUAN_FIELD_MAP = {
  carbonStorage: "carbonStorageYuan",
  carbonSequestration: "carbonSequestrationYuan",
  oxygenProduction: "oxygenProductionYuan",
  stormwaterIntercepted: "stormwaterInterceptionYuan",
  airPollutionRemoved: "airPurificationYuan",
  energySaved: "energySavingYuan",
};

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

// 以 DX-221 基准按胸径/健康/古树/树种稳定缩放，得到单棵树的 mock 演示值；
// 当真实数据缺失时用它补齐六项实物量与货币价值。
function computeMockBreakdown(tree) {
  const dbh = Number(tree?.dbh);
  if (!tree || !Number.isFinite(dbh) || dbh <= 0) {
    return { physical: {}, monetary: {}, totalValueYuan: 0 };
  }

  const isBaselineTree = tree.id === "DX-221" || tree.code === "DX-221";
  const healthFactor = tree.healthStatus === "problem"
    ? 0.82
    : tree.healthStatus === "warning" ? 0.92 : 1;
  const ancientFactor = tree.isAncient || tree.treeType === "古树" ? 1.18 : 1;
  const speciesFactor = isBaselineTree ? 1 : stableSpeciesFactor(tree.species);
  const scale = isBaselineTree
    ? 1
    : Math.pow(dbh / BASE_DBH, 1.35) * healthFactor * ancientFactor * speciesFactor;

  const physical = {};
  const monetary = {};
  ECO_BENEFIT_METRICS.forEach((metric) => {
    physical[metric.key] = roundMetric(BASELINE[metric.key] * scale);
    monetary[metric.key] = roundMetric(BASELINE[`${metric.key}ValueYuan`] * scale);
  });
  const totalValueYuan = roundMetric(
    TOTAL_VALUE_METRICS.reduce((total, metric) => total + monetary[metric.key], 0)
  );
  return { physical, monetary, totalValueYuan };
}

// 单棵树六项生态效益：实物量取 tree.ecologicalBenefits，货币价值取 tree.eco；
// 任一字段缺失时回退到 mock 演示值，避免点击树木后只有合计、其余为 0。
export function mockTreeEcoBenefits(tree) {
  const mock = computeMockBreakdown(tree);
  const realPhysical = tree?.ecologicalBenefits || {};
  const realEco = tree?.eco || {};

  const result = {};
  ECO_BENEFIT_METRICS.forEach((metric) => {
    const physicalValue = realPhysical[metric.key];
    result[metric.key] =
      typeof physicalValue === "number" && Number.isFinite(physicalValue)
        ? physicalValue
        : (mock.physical[metric.key] ?? 0);

    const monetaryValue = realEco[YUAN_FIELD_MAP[metric.key]];
    result[`${metric.key}ValueYuan`] =
      typeof monetaryValue === "number" && Number.isFinite(monetaryValue)
        ? monetaryValue
        : (mock.monetary[metric.key] ?? 0);
  });

  const realTotal = realEco.annualValueYuan;
  if (typeof realTotal === "number" && Number.isFinite(realTotal)) {
    // 有真实合计时，把“计入合计”的五项货币价值按比例缩放，使合计与真实值一致；
    // 碳储量单列、不参与缩放与合计。
    const includedSum = TOTAL_VALUE_METRICS.reduce(
      (total, metric) => total + result[`${metric.key}ValueYuan`],
      0
    );
    if (includedSum > 0) {
      const factor = realTotal / includedSum;
      TOTAL_VALUE_METRICS.forEach((metric) => {
        result[`${metric.key}ValueYuan`] = roundMetric(
          result[`${metric.key}ValueYuan`] * factor
        );
      });
    }
    result.totalValueYuan = roundMetric(realTotal);
  } else {
    result.totalValueYuan = roundMetric(
      TOTAL_VALUE_METRICS.reduce(
        (total, metric) => total + result[`${metric.key}ValueYuan`],
        0
      )
    );
  }

  return result;
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
