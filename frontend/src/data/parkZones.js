import { haversineDistance } from "../api/mockApi";

// 缓冲区中心取景区树木点位均值，半径覆盖景区及周边可步行范围。
export const PARK_ZONES = [
  {
    id: "daxingshansi",
    siteName: "大兴善寺",
    center: { lat: 34.228779, lng: 108.938921 },
    radiusM: 500,
    windows: [
      { key: "3-4", label: "3~4月", species: ["樱花", "樱桃李", "紫藤"] },
      { key: "6-7", label: "6~7月", species: ["女贞"] },
      { key: "7-8", label: "7~8月", species: ["槐树", "国槐"] },
      { key: "9-10", label: "9~10月", species: ["桂花"] },
      { key: "10-11", label: "10~11月", species: ["银杏", "枫树"] },
    ],
  },
  {
    id: "tangdacien-temple-park",
    siteName: "唐大慈恩寺遗址公园",
    center: { lat: 34.21916, lng: 108.96227 },
    radiusM: 500,
    windows: [
      { key: "10-11-1", label: "10~11月", species: ["银杏", "枫树"] },
    ],
  },
];

// 判断坐标是否落在任一已开通路线的景区缓冲区内，返回匹配的景区或 null。
export function findMatchedPark(lat, lng) {
  return (
    PARK_ZONES.find(
      (zone) => haversineDistance(lat, lng, zone.center.lat, zone.center.lng) <= zone.radiusM
    ) || null
  );
}
