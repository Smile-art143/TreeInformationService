export const SITE_ID_BY_NAME = {
  "大兴善寺": "daxingshansi",
  "唐大慈恩寺遗址公园": "tangdacien-temple-park",
  "公众访问": "public",
};

export const SITE_NAME_BY_ID = {
  daxingshansi: "大兴善寺",
  "tangdacien-temple-park": "唐大慈恩寺遗址公园",
  public: "公众访问",
  platform: "平台管理组",
};

export function siteIdByName(siteName) {
  return SITE_ID_BY_NAME[siteName] || siteName;
}

export function siteNameById(siteId) {
  return SITE_NAME_BY_ID[siteId] || siteId;
}

function toPhotoList(photos) {
  if (!Array.isArray(photos)) return [];
  return photos
    .map((photo) => {
      if (typeof photo === "string") {
        return { uid: `photo-${photo.length}-${photo.slice(-12)}`, name: "树木照片", url: photo };
      }
      return photo && typeof photo === "object"
        ? {
            uid: photo.uid || `photo-${photo.url || ""}`,
            name: photo.name || "现场照片",
            url: photo.url || "",
            size: photo.size,
            type: photo.type,
          }
        : null;
    })
    .filter(Boolean);
}

// 后端 Tree 用 code 作唯一标识且 photos 为 Photo[]；
// 页面当前按 mock 约定使用 tree.id 与字符串 photos，因此在这里做适配。
export function toTree(tree) {
  if (!tree) return tree;
  const photoList = toPhotoList(tree.photos);
  return {
    ...tree,
    id: tree.code ?? tree.id,
    code: tree.code ?? tree.id,
    photos: photoList.map((photo) => photo.url),
    photoList,
    ecologicalBenefits: tree.ecologicalBenefits || null,
  };
}

export function toWorkOrder(order) {
  if (!order) return order;
  return {
    ...order,
    id: order.id || `wo-${order.id}`,
    treeId: order.treeId ?? order.tree?.code ?? "",
    createPhotos: order.createPhotos || [],
    treatmentPhotos: order.treatmentPhotos || [],
    tree: order.tree || null,
  };
}

export function toWorkOrderPage(data) {
  const list = Array.isArray(data?.list) ? data.list.map(toWorkOrder) : [];
  return {
    list,
    total: data?.total ?? list.length,
    page: data?.page ?? 1,
    pageSize: data?.pageSize ?? list.length,
    stats: data?.stats || { created: 0, processing: 0, reviewing: 0, archived: 0 },
  };
}

export function toVisitorLead(lead) {
  if (!lead) return lead;
  return {
    ...lead,
    id: lead.id || `lead-${lead.id}`,
    treeId: lead.treeId ?? lead.tree?.code ?? "",
    photos: toPhotoList(lead.photos),
    tree: lead.tree || null,
  };
}

export function toCheckIn(record) {
  if (!record) return record;
  const photos = toPhotoList(record.photos);
  const likedBy = Array.isArray(record.likedBy) ? record.likedBy : [];
  return {
    ...record,
    id: record.id || `ci-${record.id}`,
    photoUrl: record.photoUrl || photos[0]?.url || "",
    photos,
    likedBy,
    likeCount:
      typeof record.likeCount === "number" ? record.likeCount : likedBy.length,
  };
}

export function toUser(user) {
  if (!user) return user;
  return {
    ...user,
    id: user.id || user.userId,
    registeredAt: user.registeredAt || user.createdAt,
  };
}

function computeSiteComparison(trees) {
  const counts = new Map();
  (trees || []).forEach((tree) => {
    const key = `${tree.siteId || ""}|${tree.siteName || ""}|${tree.species || ""}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts.entries()).map(([key, count]) => {
    const [siteId, siteName, species] = key.split("|");
    return { siteId, siteName, species, count };
  });
}

export function toStatsOverview(data, trees = []) {
  return {
    totalTrees: data?.totalTrees ?? trees.length,
    speciesCount: data?.speciesCount ?? 0,
    speciesRatio: data?.speciesRatio || [],
    dbhDistribution: data?.dbhDistribution || [],
    siteComparison: data?.siteComparison || computeSiteComparison(trees),
    ecologicalBenefits: data?.ecologicalBenefits || {
      carbonStorage: 0,
      carbonSequestration: 0,
      oxygenProduction: 0,
      stormwaterIntercepted: 0,
      airPollutionRemoved: 0,
      energySaved: 0,
    },
    ecoValueSummary: data?.ecoValueSummary || null,
    ancientCount: data?.ancientCount ?? 0,
    workOrderCount: data?.workOrderCount ?? 0,
  };
}

// 后端路线/机位返回结构与页面本地数据略有差异，统一转成页面结构。
export function toPark(park) {
  if (!park) return null;
  const lat = park.centerLatitude ?? park.center?.lat;
  const lng = park.centerLongitude ?? park.center?.lng;
  return {
    id: park.parkId ?? park.id,
    parkId: park.parkId ?? park.id,
    siteName: park.siteName || siteNameById(park.siteId),
    siteId: park.siteId,
    center: {
      lat,
      lng,
    },
    centerLatitude: lat,
    centerLongitude: lng,
    radiusM: park.radiusM,
    windows: park.windows || [],
  };
}

export function toPhotoSpot(spot, parkSiteName) {
  if (!spot) return null;
  return {
    ...spot,
    id: spot.id ?? spot.code,
    code: spot.code ?? spot.id,
    siteName: spot.siteName || parkSiteName || siteNameById(spot.siteId),
  };
}

export function toSeasonalWindow(window) {
  return {
    key: window.windowKey ?? window.key,
    label: window.label,
    species: window.species || [],
  };
}
