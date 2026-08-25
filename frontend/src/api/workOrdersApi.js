import rawTrees from "../data/trees.json";
import { createInitialWorkOrders } from "./mockApi";
import { request, withMockFallback } from "./http";
import { toWorkOrder, toWorkOrderPage } from "./adapters";
import { uploadPhotoRecords } from "./filesApi";

function nowText() {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

function mockOrderList() {
  return createInitialWorkOrders(rawTrees);
}

function filterMockOrders(params = {}) {
  let list = mockOrderList();
  if (params.status && params.status !== "all") {
    list = list.filter((order) => order.status === params.status);
  }
  if (params.keyword) {
    const kw = String(params.keyword).toLowerCase();
    list = list.filter(
      (order) =>
        order.orderNo.toLowerCase().includes(kw) ||
        order.treeId.toLowerCase().includes(kw)
    );
  }
  if (params.treeId) {
    list = list.filter((order) => order.treeId === params.treeId);
  }
  if (params.mine && params.creatorId) {
    list = list.filter((order) => order.creatorId === params.creatorId);
  }
  const stats = { created: 0, processing: 0, reviewing: 0, archived: 0 };
  mockOrderList().forEach((order) => {
    if (order.status in stats) stats[order.status] += 1;
  });
  const page = params.page || 1;
  const pageSize = params.pageSize || 8;
  return {
    list: list.slice((page - 1) * pageSize, page * pageSize),
    total: list.length,
    page,
    pageSize,
    stats,
  };
}

function mockCreateSingle(payload) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const now = nowText();
  return {
    id: `wo-${Date.now()}`,
    orderNo: `WO-${dateStr}-${Math.floor(Math.random() * 900 + 100)}`,
    treeId: payload.treeId,
    siteId: payload.siteId,
    status: "processing",
    issueType: payload.issueType,
    issueDescription: payload.issueDescription,
    locationDescription: payload.locationDescription,
    healthStatus: payload.healthStatus,
    creatorId: payload.creatorId,
    creatorRole: payload.creatorRole,
    creatorName: payload.creatorName,
    createPhotos: payload.createPhotos || [],
    treatmentPhotos: [],
    createdAt: now,
    updatedAt: now,
  };
}

function mockCreateBatch(treeIds, options = {}) {
  const existingSet = new Set(options.existingWorkOrderTreeIds || []);
  const success = [];
  const failed = [];
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  (treeIds || []).forEach((treeId, index) => {
    if (existingSet.has(treeId)) {
      failed.push({ treeId, reason: "已有在办工单" });
      return;
    }
    success.push({
      id: `wo-${Date.now()}-${index}`,
      orderNo: `WO-${dateStr}-${Math.floor(Math.random() * 900 + 100)}-${index + 1}`,
      treeId,
      status: "processing",
      issueType: options.issueType || "重点保护巡检",
      issueDescription: options.issueDescription || "生态热点重点保护巡检",
      creatorId: options.creatorId,
      creatorRole: options.creatorRole,
      creatorName: options.creatorName,
      createPhotos: [],
      treatmentPhotos: [],
      createdAt: nowText(),
      updatedAt: nowText(),
      __alreadyCreated: true,
    });
  });
  return {
    successCount: success.length,
    failedCount: failed.length,
    success: success.map(toWorkOrder),
    failed,
  };
}

export async function fetchWorkOrders(params = {}) {
  const { full = true, ...query } = params;
  return withMockFallback(
    async () => {
      const data = await request("get", "/api/work-orders", { params: query });
      const pageData = toWorkOrderPage(data);
      if (full && pageData.list.length > 0) {
        const details = await Promise.allSettled(
          pageData.list.map((order) =>
            request("get", `/api/work-orders/${encodeURIComponent(order.id)}`)
          )
        );
        pageData.list = pageData.list.map((order, index) => {
          const detail = details[index];
          return detail.status === "fulfilled"
            ? toWorkOrder({ ...order, ...detail.value })
            : order;
        });
      }
      return pageData;
    },
    () => filterMockOrders(query)
  );
}

export async function getWorkOrderDetail(orderId) {
  return withMockFallback(
    async () => {
      const order = await request("get", `/api/work-orders/${encodeURIComponent(orderId)}`);
      return toWorkOrder(order);
    },
    () => toWorkOrder(mockOrderList().find((order) => order.id === orderId) || null)
  );
}

export async function createWorkOrder(payload = {}) {
  return withMockFallback(
    async () => {
      if (Array.isArray(payload.treeIds)) {
        const result = await request("post", "/api/work-orders", {
          data: {
            treeIds: payload.treeIds,
            issueType: payload.issueType || "重点保护巡检",
            issueDescription:
              payload.issueDescription || "生态热点重点保护巡检",
            locationDescription: payload.locationDescription,
            healthStatus: payload.healthStatus || "healthy",
            createPhotos: [],
            priorityLevel: payload.priorityLevel,
            sourceType: payload.sourceType || "eco_hotspot",
            sourceRefId: payload.sourceRefId,
          },
        });
        return {
          ...result,
          success: (result.success || []).map((order) => ({
            ...toWorkOrder(order),
            __alreadyCreated: true,
          })),
        };
      }
      const createPhotos = await uploadPhotoRecords(payload.createPhotos || [], "order");
      const order = await request("post", "/api/work-orders", {
        data: {
          treeId: payload.treeId,
          issueType: payload.issueType,
          issueDescription: payload.issueDescription,
          locationDescription: payload.locationDescription,
          healthStatus: payload.healthStatus || "healthy",
          createPhotos,
        },
      });
      return toWorkOrder(order);
    },
    () => {
      if (Array.isArray(payload.treeIds)) {
        return mockCreateBatch(payload.treeIds, payload);
      }
      return toWorkOrder(mockCreateSingle(payload));
    }
  );
}

export async function processWorkOrder(orderId, payload = {}) {
  return withMockFallback(
    async () => {
      const treatmentPhotos = await uploadPhotoRecords(payload.treatmentPhotos || [], "order");
      const order = await request("patch", `/api/work-orders/${encodeURIComponent(orderId)}/process`, {
        data: {
          treatmentMeasures: payload.treatmentMeasures,
          treatmentPhotos,
        },
      });
      return toWorkOrder(order);
    },
    () => {
      const now = nowText();
      return toWorkOrder({
        ...mockOrderList().find((order) => order.id === orderId),
        status: "reviewing",
        treatmentMeasures: payload.treatmentMeasures,
        treatmentPhotos: payload.treatmentPhotos || [],
        processedAt: now,
        updatedAt: now,
      });
    }
  );
}

export async function reviewWorkOrder(orderId, payload = {}) {
  return withMockFallback(
    async () => {
      const order = await request("patch", `/api/work-orders/${encodeURIComponent(orderId)}/review`, {
        data: {
          passed: payload.passed,
          reviewComment: payload.reviewComment,
          reviewHealthStatus: payload.reviewHealthStatus,
        },
      });
      return toWorkOrder(order);
    },
    () => {
      const now = nowText();
      return toWorkOrder({
        ...mockOrderList().find((order) => order.id === orderId),
        status: payload.passed ? "archived" : "processing",
        reviewResult: payload.passed ? "passed" : "rework",
        reviewComment: payload.reviewComment,
        reviewHealthStatus: payload.reviewHealthStatus,
        reviewedAt: now,
        archivedAt: payload.passed ? now : undefined,
        updatedAt: now,
      });
    }
  );
}
