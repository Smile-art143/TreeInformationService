import {
  area,
  bbox,
  booleanPointInPolygon,
  featureCollection,
  point,
  squareGrid,
} from "@turf/turf";
import * as ss from "simple-statistics";

export const GRID_CELL_SIZE_METERS = 20;
export const LEVEL_COUNT = 5;

function ecoValueOf(tree) {
  const value = tree?.eco?.annualValueYuan;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// ss.jenks 在样本数小于分级数或数值全相等时返回 null，此时退回等间距分界。
export function getJenksBreaks(values, classCount = LEVEL_COUNT) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return Array(classCount + 1).fill(0);

  const jenksResult = ss.jenks(sorted, classCount);
  if (
    Array.isArray(jenksResult) &&
    jenksResult.length === classCount + 1 &&
    new Set(jenksResult).size === classCount + 1
  ) {
    return jenksResult;
  }

  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (min === max) {
    return [min, ...Array(classCount - 1).fill(min), max];
  }

  const span = max - min;
  const midBreaks = Array.from(
    { length: classCount - 1 },
    (_, index) => min + (span * (index + 1)) / classCount
  );
  return [min, ...midBreaks, max];
}

function levelOf(value, breaks) {
  for (let index = 1; index < breaks.length; index += 1) {
    if (value <= breaks[index]) return index;
  }
  return LEVEL_COUNT;
}

export function sortTreesByEcoValueDesc(trees) {
  return [...trees].sort((a, b) => {
    const valueA = a?.eco?.annualValueYuan ?? -1;
    const valueB = b?.eco?.annualValueYuan ?? -1;
    return valueB - valueA;
  });
}

// 输入：当前园区树木数组；输出：带 level 的网格 GeoJSON 数组。
export function computeEcoGrids(trees, options) {
  return computeEcoGridAnalysis(trees, options).grids;
}

// 核心纯计算：网格划分、树木归属、统计、自然断点分级。
export function computeEcoGridAnalysis(
  trees,
  { cellSizeMeters = GRID_CELL_SIZE_METERS } = {}
) {
  const locatedTrees = trees.filter(
    (tree) =>
      Number.isFinite(tree?.longitude) &&
      Number.isFinite(tree?.latitude)
  );

  if (locatedTrees.length === 0) {
    return {
      grids: [],
      gridTreeMap: new Map(),
      breaks: Array(LEVEL_COUNT + 1).fill(0),
    };
  }

  const bounds = bbox(
    featureCollection(
      locatedTrees.map((tree) => point([tree.longitude, tree.latitude]))
    )
  );
  const cellFeatures = squareGrid(bounds, cellSizeMeters, {
    units: "meters",
  }).features;
  const points = locatedTrees.map((tree) => point([tree.longitude, tree.latitude]));
  const assignedTreeIndexes = new Set();
  const grids = [];
  const gridTreeMap = new Map();

  cellFeatures.forEach((cell, index) => {
    const gridId = `grid-${index}`;
    const cellTrees = [];

    locatedTrees.forEach((tree, treeIndex) => {
      if (assignedTreeIndexes.has(treeIndex)) return;
      if (booleanPointInPolygon(points[treeIndex], cell)) {
        cellTrees.push(tree);
        assignedTreeIndexes.add(treeIndex);
      }
    });

    if (cellTrees.length === 0) return;

    const totalValueYuan = Number(
      cellTrees.reduce((sum, tree) => sum + ecoValueOf(tree), 0).toFixed(2)
    );
    const areaHectares = area(cell) / 10000;

    grids.push({
      type: "Feature",
      properties: {
        gridId,
        treeCount: cellTrees.length,
        totalValueYuan,
        valuePerTree: Number((totalValueYuan / cellTrees.length).toFixed(2)),
        level: 1,
      },
      geometry: cell.geometry,
    });
    gridTreeMap.set(gridId, cellTrees);
  });

  const breaks = getJenksBreaks(grids.map((grid) => grid.properties.totalValueYuan));
  grids.forEach((grid) => {
    grid.properties.level = levelOf(grid.properties.totalValueYuan, breaks);
  });

  return { grids, gridTreeMap, breaks };
}
