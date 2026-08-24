import WebTileLayer from "@arcgis/core/layers/WebTileLayer";

// 天地图密钥 —— 请前往 https://console.tianditu.gov.cn/ 申请后填入
const TIANDITU_KEY = "68e3b341681f835b6664c94010c6896a";

// 使用 createSubclass 确保 LayerView 可被 ArcGIS 正常创建
const ThrottledWebTileLayer = WebTileLayer.createSubclass({
  constructor() {
    this._pendingQueue = [];
    this._activeCount = 0;
    this._maxConcurrent = 6; // 最多 6 个并发瓦片请求
  },

  fetchTile(level, row, col, options) {
    const self = this;
    return new Promise((resolve) => {
      const doFetch = () => {
        self._activeCount++;
        // 调用原始 WebTileLayer 的 fetchTile
        const baseFetch = WebTileLayer.prototype.fetchTile.call(self, level, row, col, options);
        baseFetch.then(
          (tile) => {
            self._activeCount--;
            self._processQueue();
            resolve(tile);
          },
          () => {
            // 请求失败（含 429）→ 1-3s 随机延迟后重试
            const delay = 1000 + Math.random() * 2000;
            self._activeCount--;
            setTimeout(() => {
              self._processQueue();
              self._enqueue(doFetch);
            }, delay);
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
