import rawTrees from "../data/trees.json";
import { createInitialVisitorLeads } from "./mockApi";
import { request, withMockFallback } from "./http";
import { toVisitorLead, toWorkOrder } from "./adapters";
import { uploadPhotoRecords } from "./filesApi";

function mockLeads() {
  return createInitialVisitorLeads(rawTrees);
}

function filterMockLeads(params = {}) {
  let list = mockLeads();
  if (params.status && params.status !== "all") {
    list = list.filter((lead) => lead.status === params.status);
  }
  const page = params.page || 1;
  const pageSize = params.pageSize || 8;
  return {
    list: list.slice((page - 1) * pageSize, page * pageSize),
    total: list.length,
    page,
    pageSize,
  };
}

function mockCreateLead(payload) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return {
    id: `lead-${Date.now()}`,
    leadNo: `LEAD-${dateStr}-${Math.floor(Math.random() * 900 + 100)}`,
    treeId: payload.treeId,
    siteId: payload.siteId,
    status: "new",
    issueType: payload.issueType,
    issueDescription: payload.issueDescription,
    locationDescription: payload.locationDescription,
    photos: payload.photos || [],
    submitterId: payload.submitterId,
    submitterName: payload.submitterName,
    createdAt: new Date().toLocaleString("zh-CN", { hour12: false }),
    convertedAt: undefined,
    convertedOrderId: undefined,
  };
}

export async function fetchVisitorLeads(params = {}) {
  return withMockFallback(
    async () => {
      const data = await request("get", "/api/visitor-leads", { params });
      return {
        ...data,
        list: (data.list || []).map(toVisitorLead),
      };
    },
    () => filterMockLeads(params)
  );
}

export async function createVisitorLead(payload = {}) {
  return withMockFallback(
    async () => {
      const photos = await uploadPhotoRecords(payload.photos || [], "lead");
      const lead = await request("post", "/api/visitor-leads", {
        data: {
          treeId: payload.treeId,
          issueType: payload.issueType,
          issueDescription: payload.issueDescription,
          locationDescription: payload.locationDescription,
          photos,
        },
      });
      return toVisitorLead(lead);
    },
    () => toVisitorLead(mockCreateLead(payload))
  );
}

export async function updateVisitorLead(leadId, payload = {}) {
  return withMockFallback(
    async () => {
      const lead = await request("put", `/api/visitor-leads/${encodeURIComponent(leadId)}`, {
        data: {
          issueType: payload.issueType,
          issueDescription: payload.issueDescription,
          locationDescription: payload.locationDescription,
          healthStatus: payload.healthStatus,
        },
      });
      return toVisitorLead(lead);
    },
    () =>
      toVisitorLead({
        ...mockLeads().find((lead) => lead.id === leadId),
        ...payload,
      })
  );
}

export async function deleteVisitorLead(leadId) {
  return withMockFallback(
    async () => {
      await request("delete", `/api/visitor-leads/${encodeURIComponent(leadId)}`);
      return null;
    },
    () => null
  );
}

export async function convertVisitorLead(leadId) {
  return withMockFallback(
    async () => {
      const order = await request(
        "post",
        `/api/visitor-leads/${encodeURIComponent(leadId)}/convert`
      );
      return toWorkOrder(order);
    },
    () => {
      const lead = mockLeads().find((item) => item.id === leadId);
      return toWorkOrder({
        id: `wo-${Date.now()}`,
        orderNo: `WO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`,
        treeId: lead?.treeId,
        status: "processing",
        issueType: lead?.issueType,
        issueDescription: lead?.issueDescription,
        locationDescription: lead?.locationDescription,
        createPhotos: lead?.photos || [],
        treatmentPhotos: [],
        sourceLeadId: leadId,
        createdAt: new Date().toLocaleString("zh-CN", { hour12: false }),
        updatedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
      });
    }
  );
}
