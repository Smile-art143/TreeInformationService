import rawTrees from "../data/trees.json";
import { buildStats } from "./mockApi";
import { request, withMockFallback } from "./http";
import { toStatsOverview } from "./adapters";

function mockStats() {
  const base = buildStats(rawTrees);
  return {
    ...base,
    ancientCount: rawTrees.filter((tree) => tree.isAncient || tree.treeType === "古树").length,
    workOrderCount: 0,
    ecoValueSummary: null,
  };
}

export async function fetchStatsOverview(params = {}, trees = rawTrees) {
  return withMockFallback(
    async () => {
      const data = await request("get", "/api/stats/overview", { params });
      return toStatsOverview(data, trees);
    },
    () => toStatsOverview(mockStats(), trees)
  );
}
