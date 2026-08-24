export const ECO_SPECIES_COLORS = [
  "#0E7C86",
  "#6A4C9C",
  "#C2455D",
  "#E07B2E",
  "#2E8B74",
  "#4678A8",
  "#B35C9F",
  "#7B9E2B",
  "#C77E1A",
  "#3E8FBF",
  "#A9508D",
  "#4B9B82",
];

export const ECO_SPECIES_STYLES = [
  "circle",
  "square",
  "triangle",
  "diamond",
  "cross",
  "x",
];

export const TREE_VALUE_SIZE_STOPS = [
  { key: "low", label: "低", range: "≤ ¥40", size: 8 },
  { key: "medium", label: "中", range: "¥40–¥100", size: 14 },
  { key: "high", label: "高", range: "> ¥100", size: 22 },
];

function hashString(value = "") {
  let hash = 0;
  for (const char of value) {
    hash = ((hash << 5) - hash + char.codePointAt(0)) | 0;
  }
  return Math.abs(hash);
}

export function speciesSymbolConfig(species) {
  const comboCount = ECO_SPECIES_COLORS.length * ECO_SPECIES_STYLES.length;
  const index = hashString(species) % comboCount;
  return {
    color: ECO_SPECIES_COLORS[
      Math.floor(index / ECO_SPECIES_STYLES.length) % ECO_SPECIES_COLORS.length
    ],
    style: ECO_SPECIES_STYLES[index % ECO_SPECIES_STYLES.length],
  };
}

export function treeMarkerSize(annualValueYuan) {
  const value = Number.isFinite(annualValueYuan) ? annualValueYuan : 0;
  if (value > 100) return TREE_VALUE_SIZE_STOPS[2].size;
  if (value > 40) return TREE_VALUE_SIZE_STOPS[1].size;
  return TREE_VALUE_SIZE_STOPS[0].size;
}
