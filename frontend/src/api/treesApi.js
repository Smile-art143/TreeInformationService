import rawTrees from "../data/trees.json";
import { computeNextTreeCode, findNearbyTrees } from "./mockApi";
import { request, withMockFallback } from "./http";
import { toTree } from "./adapters";
import { uploadPhotoRecords } from "./filesApi";
import { exportTreesAsShp } from "./shpExport";
import {
  fetchFeatureServiceTrees,
  isTreeFeatureServiceConfigured,
} from "./treeFeatureService";

function filterMockTrees({ siteId, keyword } = {}) {
  let list = rawTrees;
  if (siteId) {
    list = list.filter((tree) => tree.siteId === siteId);
  }
  if (keyword) {
    const kw = String(keyword).toLowerCase();
    list = list.filter(
      (tree) =>
        tree.code.toLowerCase().includes(kw) ||
        tree.species.toLowerCase().includes(kw) ||
        tree.siteName.toLowerCase().includes(kw)
    );
  }
  return [...list];
}

function filterTreesByParams(list, { siteId, keyword } = {}) {
  let result = list;
  if (siteId) {
    result = result.filter((tree) => tree.siteId === siteId);
  }
  if (keyword) {
    const kw = String(keyword).toLowerCase();
    result = result.filter(
      (tree) =>
        tree.code.toLowerCase().includes(kw) ||
        tree.species.toLowerCase().includes(kw) ||
        tree.siteName.toLowerCase().includes(kw)
    );
  }
  return result;
}

export async function fetchTrees(params = {}) {
  if (isTreeFeatureServiceConfigured()) {
    try {
      const list = await fetchFeatureServiceTrees();
      return filterTreesByParams(list, params);
    } catch (error) {
      console.warn("[trees] 树木要素服务获取失败，降级后端/mock：", error?.message || error);
    }
  }
  return withMockFallback(
    async () => {
      const list = await request("get", "/api/trees", { params });
      return (list || []).map(toTree);
    },
    () => filterMockTrees(params).map(toTree)
  );
}

export async function fetchTreeDetail(code) {
  if (isTreeFeatureServiceConfigured()) {
    try {
      const list = await fetchFeatureServiceTrees();
      return list.find((tree) => tree.code === code) || null;
    } catch (error) {
      console.warn("[trees] 树木要素服务详情失败，降级后端/mock：", error?.message || error);
    }
  }
  return withMockFallback(
    async () => {
      const tree = await request("get", `/api/trees/${encodeURIComponent(code)}`);
      return toTree(tree);
    },
    () => toTree(rawTrees.find((tree) => tree.code === code) || null)
  );
}

function mockCreateTree(payload, existingTrees = rawTrees) {
  const nextCode = String(payload.code || payload.id || "").trim() || computeNextTreeCode(existingTrees);
  const photos = Array.isArray(payload.photos)
    ? payload.photos.map((photo) => (typeof photo === "string" ? photo : photo.url || ""))
    : [];
  return {
    id: nextCode,
    code: nextCode,
    species: payload.species,
    dbh: Number(payload.dbh) || 0,
    longitude: Number(payload.longitude) || 0,
    latitude: Number(payload.latitude) || 0,
    siteId: payload.siteId || "daxingshansi",
    siteName: payload.siteName || "大兴善寺",
    treeType: payload.treeType || "普通树",
    isAncient: payload.treeType === "古树",
    protectionLevel: payload.protectionLevel || null,
    healthStatus: payload.healthStatus || "healthy",
    locationDescription: payload.locationDescription || "",
    photos,
    photoList: payload.photos || [],
    story: payload.story || "",
    remark: payload.remark || "",
  };
}

export async function createTree(payload = {}, existingTrees = rawTrees) {
  return withMockFallback(
    async () => {
      const photos = await uploadPhotoRecords(payload.photos || [], "tree");
      const body = {
        species: payload.species,
        dbh: payload.dbh == null || payload.dbh === "" ? undefined : Number(payload.dbh),
        longitude: Number(payload.longitude),
        latitude: Number(payload.latitude),
        siteId: payload.siteId,
        treeType: payload.treeType || "普通树",
        protectionLevel: payload.protectionLevel,
        healthStatus: payload.healthStatus || "healthy",
        story: payload.story || undefined,
        photos,
      };
      const tree = await request("post", "/api/trees", { data: body });
      return toTree(tree);
    },
    () => toTree(mockCreateTree(payload, existingTrees))
  );
}

export async function updateTree(code, patch = {}) {
  return withMockFallback(
    async () => {
      const body = { ...patch };
      if (patch.photos) {
        body.photos = await uploadPhotoRecords(patch.photos, "tree");
      }
      delete body.id;
      delete body.code;
      delete body.longitude;
      delete body.latitude;
      delete body.siteId;
      delete body.siteName;
      const tree = await request("patch", `/api/trees/${encodeURIComponent(code)}`, {
        data: body,
      });
      return toTree(tree);
    },
    () => toTree({ ...patch, code })
  );
}

export async function fetchNearbyTrees({ latitude, longitude, radius, page = 1, pageSize = 50 } = {}) {
  if (isTreeFeatureServiceConfigured()) {
    try {
      const list = await fetchFeatureServiceTrees();
      const all = findNearbyTrees(list, latitude, longitude, radius);
      const start = (page - 1) * pageSize;
      return {
        list: all.slice(start, start + pageSize),
        total: all.length,
        page,
        pageSize,
      };
    } catch (error) {
      console.warn("[trees] 树木要素服务周边查询失败，降级后端/mock：", error?.message || error);
    }
  }
  return withMockFallback(
    async () => {
      const data = await request("get", "/api/trees/nearby", {
        params: {
          latitude,
          longitude,
          radius,
          page,
          pageSize,
        },
      });
      return {
        ...data,
        list: (data.list || []).map(toTree),
      };
    },
    () => {
      const all = findNearbyTrees(rawTrees, latitude, longitude, radius);
      const start = (page - 1) * pageSize;
      return {
        list: all.slice(start, start + pageSize).map(toTree),
        total: all.length,
        page,
        pageSize,
      };
    }
  );
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "TreePoint.zip";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function exportTreesShp(trees = rawTrees) {
  return withMockFallback(
    async () => {
      const response = await request("get", "/api/trees/export/shp", {
        responseType: "blob",
      });
      downloadBlob(response.data, "TreePoint.zip");
      return "TreePoint.zip";
    },
    () => {
      exportTreesAsShp(trees);
      return "TreePoint.zip";
    }
  );
}
