import Graphic from "@arcgis/core/Graphic";
import Polyline from "@arcgis/core/geometry/Polyline";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import WebTileLayer from "@arcgis/core/layers/WebTileLayer";
import SimpleLineSymbol from "@arcgis/core/symbols/SimpleLineSymbol";

// 天地图密钥 —— 请前往 https://console.tianditu.gov.cn/ 申请后填入
const TIANDITU_KEY = "68e3b341681f835b6664c94010c6896a";
const OFFLINE_MODE = import.meta.env.VITE_OFFLINE_MODE === "true";

const DEG2RAD = Math.PI / 180;
const CENTRAL_MERIDIAN = 108;
const FALSE_EASTING = 500000;
const ELLIPSOID_A = 6378137;
const ELLIPSOID_F = 1 / 298.257222101;
const E2 = 2 * ELLIPSOID_F - ELLIPSOID_F * ELLIPSOID_F;
const EP2 = E2 / (1 - E2);

function e4545ToWgs84(easting, northing) {
  const x = easting - FALSE_EASTING;
  const y = northing;
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const m = y;
  const mu =
    m / (ELLIPSOID_A * (1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 ** 3) / 256));
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
  const d = x / (n1 * 1);
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

function toWgs84Coordinate(x, y) {
  if (Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= 180 && Math.abs(y) <= 90) {
    return [x, y];
  }
  return e4545ToWgs84(Number(x), Number(y));
}

function appendRoadGraphics(layer, data) {
  const graphics = [];
  (data.features || []).forEach((feature) => {
    const geometry = feature.geometry || {};
    const paths =
      geometry.type === "LineString"
        ? [geometry.coordinates]
        : geometry.coordinates || [];
    paths.forEach((path) => {
      if (!Array.isArray(path) || path.length < 2) return;
      const coords = path.map(([x, y]) => toWgs84Coordinate(Number(x), Number(y)));
      graphics.push(
        new Graphic({
          geometry: new Polyline({ paths: [coords] }),
          symbol: new SimpleLineSymbol({
            color: [158, 181, 130, 0.85],
            width: 2,
          }),
        })
      );
    });
  });
  if (graphics.length) layer.addMany(graphics);
}

function loadOfflineRoadLayer(layer) {
  Promise.all([
    fetch("/road_dx.geojson").then((response) => response.json()),
    fetch("/road_dc.geojson").then((response) => response.json()),
  ])
    .then(([dxRoads, dcRoads]) => {
      appendRoadGraphics(layer, dxRoads);
      appendRoadGraphics(layer, dcRoads);
    })
    .catch(() => {
      // 离线路网加载失败时保持浅色底图，不影响树木点位展示。
    });
}

// 使用 createSubclass 确保 LayerView 可被 ArcGIS 正常创建
const ThrottledWebTileLayer = WebTileLayer.createSubclass({
  constructor() {
    this._pendingQueue = [];
    this._activeCount = 0;
    this._maxConcurrent = 6; // 最多 6 个并发瓦片请求
  },

  fetchTile(level, row, col, options) {
    const self = this;
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 3;
      const doFetch = () => {
        attempts++;
        self._activeCount++;
        // 调用原始 WebTileLayer 的 fetchTile
        const baseFetch = WebTileLayer.prototype.fetchTile.call(self, level, row, col, options);
        baseFetch.then(
          (tile) => {
            self._activeCount--;
            self._processQueue();
            resolve(tile);
          },
          (error) => {
            self._activeCount--;
            // 请求失败（含 429）→ 有限重试，最终失败时 reject，交给 ArcGIS 降级为空白瓦片
            if (attempts < maxAttempts) {
              const delay = 1000 + Math.random() * 2000;
              setTimeout(() => {
                self._processQueue();
                self._enqueue(doFetch);
              }, delay);
            } else {
              self._processQueue();
              reject(error);
            }
          }
        );
      };
      self._enqueue(doFetch);
    });
  },

  _enqueue(fn) {
    if (this._activeCount < this._maxConcurrent) {
      fn();
    } else {
      this._pendingQueue.push(fn);
    }
  },

  _processQueue() {
    while (this._activeCount < this._maxConcurrent && this._pendingQueue.length) {
      this._pendingQueue.shift()();
    }
  },
});

export function createTiandituBaseLayers() {
  if (OFFLINE_MODE) {
    const roadLayer = new GraphicsLayer({
      title: "离线路网底图",
      listMode: "hide",
    });
    loadOfflineRoadLayer(roadLayer);
    return [roadLayer];
  }

  // 天地图矢量底图（限流 + 自动重试）
  const vecLayer = new ThrottledWebTileLayer({
    title: "天地图矢量底图",
    urlTemplate: `https://{subDomain}.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={level}&TILEROW={row}&TILECOL={col}&tk=${TIANDITU_KEY}`,
    subDomains: ["t0", "t1", "t2", "t3"],
  });

  // 天地图矢量注记——中文标注（限流 + 自动重试）
  const cvaLayer = new ThrottledWebTileLayer({
    title: "天地图矢量注记",
    urlTemplate: `https://{subDomain}.tianditu.gov.cn/cva_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cva&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={level}&TILEROW={row}&TILECOL={col}&tk=${TIANDITU_KEY}`,
    subDomains: ["t0", "t1", "t2", "t3"],
  });

  return [vecLayer, cvaLayer];
}
