# 前端真实接口对接说明

> 本文档说明前端如何在后端真实接口与本地 mock/离线数据之间切换，以及各业务模块的接口映射。

## 1. 开关机制

接口层统一读取 `.env` 中的环境变量：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000` | 后端 FastAPI 地址 |
| `VITE_USE_MOCK` | `true` | `true` 全部走本地 mock；`false` 优先请求真实后端 |
| `VITE_MOCK_FALLBACK_ENABLED` | `true` | 真实模式下只读接口网络异常时降级到 mock；写接口不降级 |
| `VITE_API_TIMEOUT_MS` | `10000` | Axios 超时时间 |

切换方式：

```bash
# 本地开发且后端已启动
VITE_USE_MOCK=false npm run dev

# 纯离线演示
VITE_USE_MOCK=true npm run dev
```

也可以在浏览器控制台临时覆盖：

```js
window.__XIAN_API_CONFIG__ = { baseURL: "http://localhost:8000", useMock: false };
```

## 2. 代码结构

新增/改造的接口层文件：

| 文件 | 职责 |
|---|---|
| `src/api/http.js` | Axios 实例、统一响应解包、错误码、401 处理、mock 开关 |
| `src/api/adapters.js` | 后端字段到页面字段的适配 |
| `src/api/authApi.js` | 登录、注册、当前用户、管理员审核 |
| `src/api/treesApi.js` | 树木列表/详情/新增/编辑/周边查询/SHP 导出 |
| `src/api/workOrdersApi.js` | 工单列表/详情/创建/处置/复核 |
| `src/api/visitorLeadsApi.js` | 游客线索列表/提交/编辑/删除/转工单 |
| `src/api/checkInsApi.js` | 打卡列表/新增/点赞 |
| `src/api/filesApi.js` | 统一图片上传，业务提交前自动上传 blob 图片 |
| `src/api/ecoApi.js` | 生态价值树、重点保护批量工单、生态热点接口 |
| `src/api/statsApi.js` | 统计概览 |
| `src/api/routesApi.js` | 游客景区/机位/观赏窗口/窗口树木/路线规划 |

页面组件保留原有函数名与调用方式；数据源替换集中在 `src/App.vue` 的根状态动作和上述 API 封装内。

### GeoScene GP 路径规划

`src/api/gpRoute.js` 已按 `ParkRoutePlanning.pyt` 的契约封装异步 GP 调用：

统一路由层 `src/api/routePlanner.js` 已接入三个入口：工单导航 `tree_task`、拍照机位路线 `photo_route`、季节主题路线 `season_route`，执行顺序固定为 **GP 优先 -> 高德步行 -> 本地直线**。

1. `submitGpRouteJob`：POST `submitJob`，表单字段 `park/scenario/origin/destination/stops/viewing_window_id/snap_tolerance_m/env:outSR`。
2. 轮询 `jobs/{jobId}` 的 `jobStatus`，支持进度回调与超时。
3. 成功后拉取 `route/total_meters/estimated_minutes/ordered_stops/status`，统一转成前端坐标数组、米、分钟和停靠顺序。

调用前只需配置：

```bash
VITE_GP_ROUTE_URL=https://<geoscene-host>/server/rest/services/Parks/ParkRoutePlanning/GPServer/ParkRoutePlanning
VITE_GP_ROUTE_POLL_INTERVAL_MS=1200
VITE_GP_ROUTE_TIMEOUT_MS=30000
```

坐标统一传 EPSG:4490；`park` 使用 `daxingshan/cien`，`scenario` 使用 `tree_task/photo_route/season_route`。`season_route` 必须传 `viewing_window_id`（脚本当前内置 `3-4/6-7/7-8/9-10/10-11`）。

### 树木数据要素服务

`src/api/treeFeatureService.js` 支持把 GeoScene FeatureServer 作为树木数据源：

```bash
VITE_TREE_FEATURE_SERVICE_URL=https://<geoscene-host>/server/rest/services/Parks/Trees/FeatureServer/0
VITE_TREE_FEATURE_SERVICE_LAYER=0
VITE_TREE_FEATURE_SERVICE_TOKEN=
```

- 配置 URL 后，树木列表、详情、周边查询优先使用要素服务，失败自动降级到后端/mock。
- 未配置 URL 时，地图继续使用 `src/data/trees.json` 模拟数据。
- 支持字段名兼容：`code/species/dbh/longitude/latitude/siteId/siteName/treeType/healthStatus/photos/story` 等，`photos` 支持 JSON 数组或逗号分隔 URL。
- 支持 `4326/4490/3857` 坐标，请求统一 `outSR=4326`。

## 3. 契约差异与适配

### 认证

- mock：`login/register` 使用本地 localStorage。
- 后端：`POST /api/login`、`POST /api/register`，登录返回 `{ token, user }`，接口层保存 token 并只向页面返回 `user`。

### 树木

- 后端树木唯一标识是 `code`，页面大量使用 `tree.id`，适配层统一 `id = code`。
- 后端 `photos` 是 `Photo[]`，页面按字符串 URL 展示，适配层转换为字符串数组并保留 `photoList`。
- 生态价值字段：后端返回 `ecologicalBenefits`（实物量）与 `eco`（货币价值），`mockTreeEcoBenefits` 优先使用真实字段，缺失时回退 mock 算法。

### 工单

- 列表接口返回精简版，详情字段在接口层按工单 id 拉取详情并合并，保证页面 drawer 显示完整。
- 处置走 `PATCH /api/work-orders/:id/process`，复核走 `PATCH /api/work-orders/:id/review`，页面仍通过 `updateWorkOrder` 提交。

### 游客线索

- 编辑与转工单拆成 `PUT /api/visitor-leads/:id` 与 `POST /api/visitor-leads/:id/convert`，接口层按顺序调用。

### 打卡

- 后端返回 `photos: Photo[]`，页面展示用 `photoUrl`，适配层取第一张图 URL。

### 管理员审核

- `getPendingUsers/approveUser/rejectUser` 对接 `GET /api/admin/registrations` 及 approve/reject 接口。

## 4. 异常处理

- HTTP/网络异常统一转换为 `ApiError`，携带 `code/httpStatus/message/data`。
- `40101` 表示未登录或 token 失效，拦截器清理本地登录态并派发 `xian:unauthorized`，根组件回到登录页。
- 后端业务错误码（如 `40102/40301/40302/40303/40401/40901...`）直接抛给页面 catch 展示后端中文 message。
- 是否降级 mock：只读接口在 `VITE_MOCK_FALLBACK_ENABLED=true` 且网络异常时降级；写接口不降级，避免假数据提交。

## 5. 验证建议

1. 登录：`visitor / inspector / maintenance / admin`，密码统一 `123456`。
2. 树木：地图加载后确认点位数量、点击详情字段、筛选器、周边搜索。
3. 生态价值：进入生态价值页确认单树/网格价值与后端返回一致。
4. 工单：巡检创建工单并上传图片；养护处置；巡检复核；状态与健康状态联动。
5. 游客线索：游客提交线索并上传图片；巡检编辑并转工单。
6. 打卡：游客拍照打卡、照片墙点赞，刷新后数据仍存在。
7. 审核：管理员审核巡检/养护注册申请。
8. 路线：游客进入移动端路线页，验证景区解析、机位、观赏窗口与窗口树木。
