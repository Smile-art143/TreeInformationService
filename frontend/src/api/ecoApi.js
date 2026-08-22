import rawTrees from "../data/trees.json";
import { mockTreeEcoBenefits } from "./ecoBenefits";

const API_DELAY_MS = 120;

// 为单棵树补充 mock 生态价值字段，结构对齐后端约定：
// eco: { annualValueYuan: number | null }
export function mockEcoValue(tree) {
  const annualValueYuan = mockTreeEcoBenefits(tree).totalValueYuan;

  return {
    ...tree,
    eco: { annualValueYuan },
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 替换点 1（树木数据接口）：
// 接口就绪后，改为调用 GET /api/trees?siteName=xxx 并返回带 eco 字段的树木数组，
// 替换本函数内部实现即可，下游网格计算与渲染逻辑无需改动。
export async function fetchEcoTreesBySite(siteName, { signal } = {}) {
  await delay(API_DELAY_MS);
  if (signal?.aborted) {
    throw new Error("请求已取消");
  }

  return rawTrees
    .filter((tree) => tree.siteName === siteName)
    .map((tree) => mockEcoValue(tree));
}

// 替换点 2（重点保护巡检工单）：
// 接口就绪后，改为 POST /api/work-orders，body: { treeIds, issueType: "重点保护巡检" }。
// 当前返回结构与现有工单模块保持一致，便于页面先完成交互联调。
export async function createKeyProtectionWorkOrder(treeIds) {
  if (!Array.isArray(treeIds) || treeIds.length === 0) {
    throw new Error("请至少选择一棵树木");
  }

  await delay(350);
  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  return {
    success: true,
    order: {
      id: `wo-${Date.now()}`,
      orderNo: `WO-${dateStr}-${Math.floor(Math.random() * 900 + 100)}`,
      treeIds,
      issueType: "重点保护巡检",
      status: "processing",
      createdAt: now,
      updatedAt: now,
    },
  };
}
