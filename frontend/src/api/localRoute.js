import PathFinderModule from "geojson-path-finder";
import { haversineDistance } from "./mockApi";

const PathFinder = PathFinderModule?.default || PathFinderModule;

const DEG2RAD = Math.PI / 180;
const CENTRAL_MERIDIAN = 108;
const FALSE_EASTING = 500000;
const SCALE_FACTOR = 1;
const ELLIPSOID_A = 6378137;
const ELLIPSOID_F = 1 / 298.257222101;
const E2 = 2 * ELLIPSOID_F - ELLIPSOID_F * ELLIPSOID_F;
const EP2 = E2 / (1 - E2);
const SNAP_TOLERANCE_M = 120;
const VERTEX_TOLERANCE_M = 0.05;
const PATH_FINDER_TOLERANCE = 1e-6;
const WALKING_SPEED_MPS = (4.8 * 1000) / 3600;

const ROAD_SOURCE = {
  daxingshansi: "/road_dx.geojson",
  "tangdacien-temple-park": "/road_dc.geojson",
};

const networkCache = new Map();

// CGCS2000 / 3-degree Gauss-Kruger CM 108E（EPSG:4545）正算与反算。
function meridianArc(lat) {
  const e2 = E2;
  return (
    ELLIPSOID_A *
    ((1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256) * lat -
      ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * lat) +
      ((15 * e2 * e2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * lat) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * lat))
  );
}

function wgs84ToE4545(lng, lat) {
  const latRad = lat * DEG2RAD;
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const tanLat = Math.tan(latRad);
  const n = ELLIPSOID_A / Math.sqrt(1 - E2 * sinLat * sinLat);
  const t = tanLat * tanLat;
  const c = EP2 * cosLat * cosLat;
  const a = (lng - CENTRAL_MERIDIAN) * DEG2RAD * cosLat;
  const easting =
    FALSE_EASTING +
    SCALE_FACTOR *
      n *
      (a +
        ((1 - t + c) * a ** 3) / 6 +
        ((5 - 18 * t + t * t + 72 * c - 58 * EP2) * a ** 5) / 120);
  const northing =
    SCALE_FACTOR *
    (meridianArc(latRad) +
      n *
        tanLat *
        ((a * a) / 2 +
          ((5 - t + 9 * c + 4 * c * c) * a ** 4) / 24 +
          ((61 - 58 * t + t * t + 600 * c - 330 * EP2) * a ** 6) / 720));
  return [easting, northing];
}

function e4545ToWgs84(easting, northing) {
  const x = easting - FALSE_EASTING;
  const y = northing;
  const m = y / SCALE_FACTOR;
  const mu =
    m / (ELLIPSOID_A * (1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const sin1 = Math.sin(phi1);
  const cos1 = Math.cos(phi1);
  const tan1 = Math.tan(phi1);
  const c1 = EP2 * cos1 * cos1;
  const t1 = tan1 * tan1;
  const n1 = ELLIPSOID_A / Math.sqrt(1 - E2 * sin1 * sin1);
  const r1 = (ELLIPSOID_A * (1 - E2)) / (1 - E2 * sin1 * sin1) ** 1.5;
  const d = x / (n1 * SCALE_FACTOR);
  const lat =
    phi1 -
    (n1 * tan1) /
      r1 *
      ((d * d) / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * EP2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * EP2 - 3 * c1 * c1) *
          d ** 6) /
          720);
  const lng =
    CENTRAL_MERIDIAN * DEG2RAD +
    (d -
      ((1 + 2 * t1 + c1) * d ** 3) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * EP2 + 24 * t1 * t1) * d ** 5) /
        120) /
      cos1;
  return [lng / DEG2RAD, lat / DEG2RAD];
}

function lngOf(point) {
  return Number(point?.lng ?? point?.longitude ?? point?.x);
}

function latOf(point) {
  return Number(point?.lat ?? point?.latitude ?? point?.y);
}

function toWgs84Coordinate(x, y) {
  if (Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= 180 && Math.abs(y) <= 90) {
    return [x, y];
  }
  return e4545ToWgs84(Number(x), Number(y));
}

async function loadRoadNetwork(park) {
  const url = ROAD_SOURCE[park];
  if (!url) {
    throw new Error(`未配置园区路网：${park}`);
  }
  if (!networkCache.has(park)) {
    const promise = fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`路网数据请求失败：${url}（HTTP ${response.status}）`);
        }
        return response.json();
      })
      .then((data) => parseRoadNetwork(data));
    networkCache.set(park, promise);
    try {
      await promise;
    } catch (error) {
      networkCache.delete(park);
      throw error;
    }
  }
  return networkCache.get(park);
}

function parseRoadNetwork(data) {
  const lines = [];
  (data.features || []).forEach((feature) => {
    const geometry = feature.geometry || {};
    if (geometry.type === "LineString") {
      addLine(geometry.coordinates);
    } else if (geometry.type === "MultiLineString") {
      (geometry.coordinates || []).forEach(addLine);
    }
  });

  function addLine(coordinates) {
    const projected = (coordinates || []).map(([x, y]) => [Number(x), Number(y)]);
    const wgs84 = projected.map(([x, y]) => toWgs84Coordinate(x, y));
    lines.push({ projected, wgs84 });
  }

  return { lines };
}

// 业务点先投影到 EPSG:4545 平面，按米吸附到最近路段并插入拆分顶点。
function closestPointOnSegment(point, start, end) {
  const abX = end[0] - start[0];
  const abY = end[1] - start[1];
  const lengthSq = abX * abX + abY * abY;
  const t =
    lengthSq > 0
      ? Math.max(0, Math.min(1, ((point[0] - start[0]) * abX + (point[1] - start[1]) * abY) / lengthSq))
      : 0;
  return {
    x: start[0] + t * abX,
    y: start[1] + t * abY,
    t,
  };
}

function snapPointsToNetwork(lines, points) {
  const snapped = [];
  for (const point of points) {
    const target = wgs84ToE4545(point[0], point[1]);
    let bestLine = null;
    let bestIndex = -1;
    let bestProjection = null;
    let bestDistanceSq = Number.POSITIVE_INFINITY;

    lines.forEach((line) => {
      for (let i = 0; i < line.projected.length - 1; i += 1) {
        const projection = closestPointOnSegment(target, line.projected[i], line.projected[i + 1]);
        const dx = projection.x - target[0];
        const dy = projection.y - target[1];
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq < bestDistanceSq) {
          bestDistanceSq = distanceSq;
          bestLine = line;
          bestIndex = i;
          bestProjection = projection;
        }
      }
    });

    if (!bestLine || Math.sqrt(bestDistanceSq) > SNAP_TOLERANCE_M) {
      return null;
    }

    const start = bestLine.projected[bestIndex];
    const end = bestLine.projected[bestIndex + 1];
    const startDistanceSq =
      (start[0] - bestProjection.x) ** 2 + (start[1] - bestProjection.y) ** 2;
    const endDistanceSq =
      (end[0] - bestProjection.x) ** 2 + (end[1] - bestProjection.y) ** 2;
    let coordinate;

    if (startDistanceSq <= VERTEX_TOLERANCE_M ** 2) {
      coordinate = bestLine.wgs84[bestIndex];
    } else if (endDistanceSq <= VERTEX_TOLERANCE_M ** 2) {
      coordinate = bestLine.wgs84[bestIndex + 1];
    } else {
      coordinate = e4545ToWgs84(bestProjection.x, bestProjection.y);
      bestLine.projected.splice(bestIndex + 1, 0, [bestProjection.x, bestProjection.y]);
      bestLine.wgs84.splice(bestIndex + 1, 0, coordinate);
    }

    snapped.push([Number(coordinate[0]), Number(coordinate[1])]);
  }
  return snapped;
}

function buildPathFinderFeatures(lines) {
  const features = [];
  lines.forEach((line) => {
    if (line.wgs84.length < 2) return;
    features.push({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: line.wgs84.map(([lng, lat]) => [Number(lng), Number(lat)]),
      },
    });
  });
  return { type: "FeatureCollection", features };
}

function pointFeature([lng, lat]) {
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Point", coordinates: [lng, lat] },
  };
}

export async function findLocalRoute(park, points) {
  const ordered = (points || [])
    .map((point) => [lngOf(point), latOf(point)])
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
  if (ordered.length < 2) {
    throw new Error("本地路网规划至少需要两个有效点");
  }

  const network = await loadRoadNetwork(park);
  const lines = network.lines.map((line) => ({
    projected: line.projected.map((coordinate) => [coordinate[0], coordinate[1]]),
    wgs84: line.wgs84.map((coordinate) => [coordinate[0], coordinate[1]]),
  }));
  const snapped = snapPointsToNetwork(lines, ordered);
  if (!snapped) {
    throw new Error(`起终点无法吸附到${park}路网（容差${SNAP_TOLERANCE_M}m）`);
  }

  const finder = new PathFinder(buildPathFinderFeatures(lines), {
    tolerance: PATH_FINDER_TOLERANCE,
    weight: (a, b) => haversineDistance(a[1], a[0], b[1], b[0]),
  });

  let polyline = [];
  let totalMeters = 0;
  for (let i = 0; i < snapped.length - 1; i += 1) {
    const result = finder.findPath(pointFeature(snapped[i]), pointFeature(snapped[i + 1]));
    if (!result) {
      throw new Error(`第 ${i + 1} 段路网不可达`);
    }
    const segment = polyline.length ? result.path.slice(1) : result.path;
    polyline = polyline.concat(segment);
    totalMeters += result.weight;
  }

  return {
    source: "local",
    polyline,
    polylines: [polyline],
    totalMeters: Math.round(totalMeters * 10) / 10,
    durationSeconds: Math.round(totalMeters / WALKING_SPEED_MPS),
    orderedStops: [],
  };
}
