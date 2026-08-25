import { request, apiConfig } from "./http";

function normalizeMockPhoto(photo) {
  if (!photo) return null;
  return {
    uid: photo.uid || `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: photo.name || "现场照片",
    url: photo.url || photo.thumbUrl || "",
    size: photo.size,
    type: photo.type,
  };
}

export async function uploadFile(file, bizType = "tree") {
  if (apiConfig.useMock) {
    return {
      uid: `photo-${Date.now()}`,
      name: file?.name || "现场照片",
      url: file?.url || file?.thumbUrl || "",
      size: file?.size,
      type: file?.type,
    };
  }
  const formData = new FormData();
  formData.append("file", file);
  if (bizType) {
    formData.append("bizType", bizType);
  }
  return request("post", "/api/files", {
    data: formData,
    headers: { "Content-Type": "multipart/form-data" },
  });
}

async function fileFromPhotoRecord(photo) {
  if (photo?.originFileObj instanceof File) {
    return photo.originFileObj;
  }
  const source = photo?.url || photo?.thumbUrl || "";
  if (source.startsWith("blob:") || source.startsWith("data:")) {
    const response = await fetch(source);
    const blob = await response.blob();
    return new File([blob], photo.name || "photo.jpg", {
      type: blob.type || photo.type || "image/jpeg",
    });
  }
  return null;
}

// 页面传过来的 Photo 记录可能是本地 blob；真实模式下先统一上传再提交业务数据。
export async function uploadPhotoRecords(photoRecords, bizType = "tree") {
  const records = Array.isArray(photoRecords) ? photoRecords : [];
  if (apiConfig.useMock) {
    return records.map(normalizeMockPhoto).filter(Boolean);
  }
  const uploaded = [];
  for (const photo of records) {
    const file = await fileFromPhotoRecord(photo);
    if (file) {
      const serverPhoto = await uploadFile(file, bizType);
      uploaded.push({
        uid: photo?.uid || serverPhoto?.uid || `photo-${Date.now()}`,
        name: serverPhoto?.name || photo?.name || "现场照片",
        url: serverPhoto?.url || photo?.url || "",
        size: serverPhoto?.size,
        type: serverPhoto?.type,
      });
    } else {
      const normalized = normalizeMockPhoto(photo);
      if (normalized?.url) {
        uploaded.push(normalized);
      }
    }
  }
  return uploaded;
}
