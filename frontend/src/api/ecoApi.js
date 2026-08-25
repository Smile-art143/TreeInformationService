import rawTrees from "../data/trees.json";
import { siteIdByName } from "./adapters";
import { fetchTrees } from "./treesApi";
import { createWorkOrder } from "./workOrdersApi";
import { request, withMockFallback, isMockMode } from "./http";
import { mockTreeEcoBenefits } from "./ecoBenefits";

const API_DELAY_MS = 120;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 为单棵树补充 mock 生态价值字段，结构对齐后端约定：
// eco: { annualValueYuan: number | null }
export function mockEcoValue(tree) {
  const annualValueYuan = mockTreeEcoBenefits(tree).totalValueYuan;
  return {
    ...tree,
    eco: { annualValueYuan },
  };
}

export async function fetchEcoTreesBySite(siteName, { signal } = {}) {
  if (isMockMode()) {
    await delay(API_DELAY_MS);
    if (signal?.aborted) {
      throw new Error("请求已取消");
    }
    return rawTrees
      .filter((tree) => tree.siteName === siteName)
      .map((tree) => mockEcoValue(tree));
  }

  const siteId = siteIdByName(siteName);
  const trees = await fetchTrees({ siteId });
  if (signal?.aborted) {
    throw new Error("请求已取消");
  }
  return trees;
}

export async function createKeyProtectionWorkOrder(
  treeIds,
  {
    creatorId,
    creatorRole,
    creatorName,
    issueDescription,
    existingWorkOrderTreeIds = [],
    sourceRefId,
  } = {}
) {
  if (!Array.isArray(treeIds) || treeIds.length === 0) {
    throw new Error("请至少选择一棵树木");
  }
  return createWorkOrder({
    treeIds,
    issueType: "重点保护巡检",
    issueDescription: issueDescription || "生态热点重点保护巡检",
    creatorId,
    creatorRole,
    creatorName,
    existingWorkOrderTreeIds,
    sourceType: "eco_hotspot",
    sourceRefId,
  });
}

export async function fetchEcoHotspot(params = {}) {
  return withMockFallback(
    async () => {
      return request("get", "/api/analysis/eco-hotspot", { params });
    },
    () => ({ list: [], total: 0, page: params.page || 1, pageSize: params.pageSize || 20 })
  );
}

export async function fetchEcoHotspotTrees(gridId, params = {}) {
  return withMockFallback(
    async () => {
      return request("get", `/api/analysis/eco-hotspot/${encodeURIComponent(gridId)}/trees`, {
        params,
      });
    },
    () => ({ list: [], total: 0, page: params.page || 1, pageSize: params.pageSize || 20 })
  );
}
