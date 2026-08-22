export const SPECIES_LEGEND_COUNT = 7;
export const OTHER_SPECIES_KEY = "__other__";
export const OTHER_SPECIES_LABEL = "其他树种";

export const ECO_SPECIES_COLORS = [
  "#0E7C86",
  "#C2455D",
  "#E07B2E",
  "#2E8B74",
  "#6A4C9C",
  "#4678A8",
  "#B35C9F",
  "#7B9E2B",
];

const SIMPLE_LEAF_PATH =
  "M18 5 C 23 7, 26 12, 26 17 L20 16 L23 25 L18 23 L18 31 L17.6 34 L18.4 34 L18 31 L18 23 L13 25 L16 16 L10 17 C 10 12, 13 7, 18 5 Z";
const SIMPLE_LEAF_VEINS =
  "M18 7 L18 30 M18 14 L12 17 M18 14 L24 17";

const LEAF_SYMBOLS = [
  {
    key: "leaf-0",
    path: SIMPLE_LEAF_PATH,
    rotate: 0,
    veins: SIMPLE_LEAF_VEINS,
  },
  {
    key: "leaf-45",
    path: SIMPLE_LEAF_PATH,
    rotate: 45,
    veins: SIMPLE_LEAF_VEINS,
  },
  {
    key: "leaf-90",
    path: SIMPLE_LEAF_PATH,
    rotate: 90,
    veins: SIMPLE_LEAF_VEINS,
  },
  {
    key: "leaf-135",
    path: SIMPLE_LEAF_PATH,
    rotate: 135,
    veins: SIMPLE_LEAF_VEINS,
  },
  {
    key: "leaf-180",
    path: SIMPLE_LEAF_PATH,
    rotate: 180,
    veins: SIMPLE_LEAF_VEINS,
  },
  {
    key: "leaf-225",
    path: SIMPLE_LEAF_PATH,
    rotate: 225,
    veins: SIMPLE_LEAF_VEINS,
  },
  {
    key: "leaf-270",
    path: SIMPLE_LEAF_PATH,
    rotate: 270,
    veins: SIMPLE_LEAF_VEINS,
  },
  {
    key: "leaf-315",
    path: SIMPLE_LEAF_PATH,
    rotate: 315,
    veins: SIMPLE_LEAF_VEINS,
  },
];

export const ECO_SPECIES_STYLES = LEAF_SYMBOLS.map((symbol) => symbol.key);

function makeLeafSymbol(index) {
  return {
    ...LEAF_SYMBOLS[index % LEAF_SYMBOLS.length],
    color: ECO_SPECIES_COLORS[index % ECO_SPECIES_COLORS.length],
  };
}

export function createLeafSymbolDataUrl(symbol) {
  const fallback = LEAF_SYMBOLS[LEAF_SYMBOLS.length - 1];
  const color = symbol?.color ?? ECO_SPECIES_COLORS[ECO_SPECIES_COLORS.length - 1];
  const path = symbol?.path ?? fallback.path;
  const veins = symbol?.veins ?? fallback.veins;
  const transform = symbol?.rotate ? ` transform="rotate(${symbol.rotate} 18 18)"` : "";
  const fillRule = symbol?.fillRule ? ` fill-rule="${symbol.fillRule}"` : "";
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">',
    `<g${transform}>`,
    `<path d="${path}" fill="${color}" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"${fillRule}/>`,
    `<path d="${veins}" fill="none" stroke="#ffffff" stroke-opacity="0.9" stroke-width="1.1" stroke-linecap="round"/>`,
    "</g>",
    "</svg>",
  ].join("");
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export const TREE_VALUE_SIZE_STOPS = [
  { key: "low", label: "低", range: "≤ ¥40", size: 8 },
  { key: "medium", label: "中", range: "¥40–¥100", size: 14 },
  { key: "high", label: "高", range: "> ¥100", size: 22 },
];

export function treeMarkerSize(annualValueYuan) {
  const value = Number.isFinite(annualValueYuan) ? annualValueYuan : 0;
  if (value > 100) return TREE_VALUE_SIZE_STOPS[2].size;
  if (value > 40) return TREE_VALUE_SIZE_STOPS[1].size;
  return TREE_VALUE_SIZE_STOPS[0].size;
}

export function buildSpeciesLeafLegend(trees, topCount = SPECIES_LEGEND_COUNT) {
  const counts = new Map();
  trees.forEach((tree) => {
    const species = tree?.species;
    if (!species) return;
    counts.set(species, (counts.get(species) ?? 0) + 1);
  });

  const ranked = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0], "zh-Hans-CN");
  });

  const topItems = ranked.slice(0, topCount).map(([species, count], index) => ({
    species,
    count,
    isOther: false,
    symbol: makeLeafSymbol(index),
  }));
  const otherCount = ranked
    .slice(topCount)
    .reduce((sum, [, count]) => sum + count, 0);

  const otherSymbol = makeLeafSymbol(LEAF_SYMBOLS.length - 1);
  const items = [...topItems];
  if (otherCount > 0) {
    items.push({
      species: OTHER_SPECIES_LABEL,
      count: otherCount,
      isOther: true,
      symbol: otherSymbol,
    });
  }

  const symbolMap = {};
  topItems.forEach((item) => {
    symbolMap[item.species] = item.symbol;
  });
  symbolMap[OTHER_SPECIES_KEY] = otherSymbol;

  return { items, symbolMap, otherSymbol, otherCount };
}
