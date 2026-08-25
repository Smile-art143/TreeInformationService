import { mockCheckInRecords } from "./mockApi";
import { request, withMockFallback } from "./http";
import { toCheckIn } from "./adapters";
import { uploadPhotoRecords } from "./filesApi";

function normalizePhotoUrl(photoUrl) {
  if (typeof photoUrl === "string" && photoUrl) {
    return {
      uid: `checkin-${Date.now()}`,
      name: "打卡照片",
      url: photoUrl,
    };
  }
  return null;
}

export async function fetchCheckIns(params = {}) {
  return withMockFallback(
    async () => {
      const data = await request("get", "/api/check-ins", {
        params: { pageSize: 1000, ...params },
      });
      return {
        ...data,
        list: (data.list || []).map(toCheckIn),
      };
    },
    () => ({
      list: mockCheckInRecords.map(toCheckIn),
      total: mockCheckInRecords.length,
      page: params.page || 1,
      pageSize: params.pageSize || 50,
    })
  );
}

export async function createCheckIn(payload = {}) {
  return withMockFallback(
    async () => {
      const photo = normalizePhotoUrl(payload.photoUrl || payload.photos?.[0]?.url);
      const photos = await uploadPhotoRecords(
        photo ? [{ ...payload.photos?.[0], ...photo }] : payload.photos || [],
        "checkin"
      );
      const record = await request("post", "/api/check-ins", {
        data: {
          treeId: payload.treeId,
          photos,
        },
      });
      return toCheckIn(record);
    },
    () => {
      const now = new Date().toLocaleString("zh-CN", { hour12: false });
      return toCheckIn({
        id: `ci-${Date.now()}`,
        treeId: payload.treeId,
        treeCode: payload.treeCode,
        species: payload.species,
        photos: [normalizePhotoUrl(payload.photoUrl)],
        photoUrl: payload.photoUrl,
        userName: payload.userName || "游客",
        likedBy: [],
        likeCount: 0,
        createdAt: now,
      });
    }
  );
}

export async function toggleCheckInLike(checkInId, liked) {
  return withMockFallback(
    async () => {
      const data = await request("patch", `/api/check-ins/${encodeURIComponent(checkInId)}/like`, {
        data: { liked: Boolean(liked) },
      });
      return data;
    },
    () => {
      const record = mockCheckInRecords.find((item) => item.id === checkInId);
      const likedBy = record?.likedBy || [];
      const nextLikedBy = liked ? [...likedBy, "me"] : likedBy.filter((item) => item !== "me");
      return {
        id: checkInId,
        likeCount: nextLikedBy.length,
        liked: Boolean(liked),
      };
    }
  );
}
