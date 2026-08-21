export const ECO_BENEFIT_METRICS = [
  { key: "carbonStorage", label: "碳储量", unit: "kg C" },
  { key: "carbonSequestration", label: "年固碳量", unit: "kg CO2/年" },
  { key: "oxygenProduction", label: "年产氧量", unit: "kg O2/年" },
  { key: "stormwaterIntercepted", label: "年截留雨水量", unit: "L/年" },
  { key: "airPollutionRemoved", label: "年净化空气污染物量", unit: "g/年" },
  { key: "energySaved", label: "年节能", unit: "kWh/年" },
];

function emptyBenefits() {
  const result = { totalValueYuan: 0 };
  ECO_BENEFIT_METRICS.forEach((metric) => {
    result[metric.key] = 0;
    result[`${metric.key}ValueYuan`] = 0;
  });
  return result;
}

// 替换点：生态效益接口就绪后，将本函数替换为按 treeId 查询真实数据。
// 当前仅 DX-221 提供 mock 数据，用于验证点击树点后面板联动。
export function mockTreeEcoBenefits(tree) {
  if (!tree || (tree.id !== "DX-221" && tree.code !== "DX-221")) {
    return emptyBenefits();
  }

  const carbonStorage = 18.6;
  const carbonStorageValueYuan = 93.0;
  const carbonSequestration = 4.68;
  const carbonSequestrationValueYuan = 0.28;
  const oxygenProduction = 13.65;
  const oxygenProductionValueYuan = 6.83;
  const stormwaterIntercepted = 120.25;
  const stormwaterInterceptedValueYuan = 0.48;
  const airPollutionRemoved = 58.5;
  const airPollutionRemovedValueYuan = 0.44;
  const energySaved = 9.75;
  const energySavedValueYuan = 1.17;

  return {
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
    totalValueYuan: Number(
      (
        carbonStorageValueYuan +
        carbonSequestrationValueYuan +
        oxygenProductionValueYuan +
        stormwaterInterceptedValueYuan +
        airPollutionRemovedValueYuan +
        energySavedValueYuan
      ).toFixed(2)
    ),
  };
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
