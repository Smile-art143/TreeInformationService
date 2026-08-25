import rawTrees from "../data/trees.json";
import { photoSpots } from "../data/photoSpots";
import { PARK_ZONES, findMatchedPark } from "../data/parkZones";
import { request, withMockFallback } from "./http";
import { toPark, toPhotoSpot, toSeasonalWindow } from "./adapters";

function mockParkById(parkId) {
  return PARK_ZONES.find((park) => park.id === parkId) || null;
}

function mockPhotoSpots(parkId) {
  const park = mockParkById(parkId);
  if (!park) return [];
  return photoSpots.filter((spot) => spot.siteName === park.siteName);
}

export async function fetchParks() {
  return withMockFallback(
    async () => {
      const data = await request("get", "/api/routes/parks");
      return (data || []).map((park) => toPark(park));
    },
    () => PARK_ZONES.map((park) => toPark(park))
  );
}

export async function resolvePark(longitude, latitude) {
  return withMockFallback(
    async () => {
      const data = await request("get", "/api/routes/parks/resolve", {
        params: { longitude, latitude },
      });
      if (!data?.park) return null;
      const park = toPark(data.park);
      const windows = await fetchSeasonalWindows(park.id);
      park.windows = windows;
      return park;
    },
    () => {
      const park = findMatchedPark(latitude, longitude);
      return park ? toPark(park) : null;
    }
  );
}

export async function fetchPhotoSpots(parkId) {
  return withMockFallback(
    async () => {
      const data = await request("get", `/api/routes/parks/${encodeURIComponent(parkId)}/photo-spots`);
      const park = (await fetchParks()).find((item) => item.id === parkId);
      return (data || []).map((spot) => toPhotoSpot(spot, park?.siteName));
    },
    () => mockPhotoSpots(parkId).map((spot) => toPhotoSpot(spot))
  );
}

export async function fetchSeasonalWindows(parkId) {
  return withMockFallback(
    async () => {
      const data = await request("get", `/api/routes/parks/${encodeURIComponent(parkId)}/seasonal-windows`);
      return (data || []).map(toSeasonalWindow);
    },
    () => (mockParkById(parkId)?.windows || []).map(toSeasonalWindow)
  );
}

export async function fetchWindowTrees(parkId, windowKey) {
  return withMockFallback(
    async () => {
      const data = await request(
        "get",
        `/api/routes/parks/${encodeURIComponent(parkId)}/seasonal-windows/${encodeURIComponent(windowKey)}/trees`
      );
      return {
        window: toSeasonalWindow(data?.window),
        trees: (data?.trees || []).map((tree) => ({
          ...tree,
          id: tree.code,
        })),
      };
    },
    () => {
      const park = mockParkById(parkId);
      const window = park?.windows.find((item) => item.key === windowKey);
      const trees = rawTrees.filter(
        (tree) =>
          tree.siteName === park?.siteName &&
          (window?.species || []).includes(tree.species)
      );
      return {
        window: window ? toSeasonalWindow(window) : null,
        trees: trees.map((tree) => ({
          id: tree.code,
          code: tree.code,
          species: tree.species,
          longitude: tree.longitude,
          latitude: tree.latitude,
          healthStatus: tree.healthStatus,
          dbh: tree.dbh,
        })),
      };
    }
  );
}

export async function planRoute(payload) {
  return withMockFallback(
    async () => {
      return request("post", "/api/routes/plan", { data: payload });
    },
    () => ({ points: payload?.points || [] })
  );
}
