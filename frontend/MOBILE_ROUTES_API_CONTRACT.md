# 后端接口统一对接说明（移动端“路线”模块）

> 本文档是 `BACKEND_API_CONTRACT.md` 的补充说明，仅覆盖 MobilePage“路线”中新增的“拍照机位路线”与“季节主题路线”两个业务模块。主契约中的通用约定、鉴权、错误码、树木模型、单位隔离等规则继续生效，本文档只约定路线模块的增量数据与接口。

## 1. 文档说明

本文档供后端负责人与开发人员对接以下移动端功能：

- 路线入口：MobilePage 底栏“路线”Tab，仅 `visitor`（游客）身份可见。
- 拍照机位路线：按景区展示拍照机位点位，支持机位详情、多选途经点、从机位中指定一个作为终点（终点与途经点互斥）、最短路径导航。
- 季节主题路线：按景区展示“观赏窗口”，高亮窗口对应树木，以树木为途经点规划最短路径，并从窗口树木中指定一个作为终点。

当前前端已实现完整交互闭环，数据来自 `src/data/photoSpots.js` 与 `MobileRoutesSection.vue` 内的本地常量。接入后端后，前端将使用以下接口替换本地 mock，不再自行维护园区缓冲区、机位点位、观赏窗口与路径规划逻辑。

### 1.1 已确认决策

1. 路线模块仅游客可访问：`role = visitor`；巡检、养护访问任意路线接口返回 `40302`。
2. 园区匹配由后端完成：前端只提交经纬度（浏览器定位或地图选点），后端按 `RoutePark.radiusM` 判断是否位于景区缓冲区内。大兴善寺与唐大慈恩寺遗址公园当前均使用 `500` 米，作为后端可配置参数。
3. 机位点位为园区静态配置数据，当前共 13 条（大兴善寺 7 条、唐大慈恩寺遗址公园 6 条），接口返回全量数组，不做分页；列表已包含详情全部字段，不单独提供机位详情接口。
4. 季节主题观赏窗口为园区静态配置，窗口通过 `species` 列表与树木关联；后端按 `siteId + species` 返回窗口树木，前端不做树种拼装。
5. 路径规划由后端负责：前端提交 `parkId/businessType/start/destination/waypoints`，后端返回有序途经点、总距离与预计时间。当前无地图路网服务时，按 Haversine 直线距离 + 最近邻/2-opt 近似计算；后续接入路网导航只影响内部实现，不改变接口契约。
6. 路线规划结果不落库，不提供路线历史、路线分享接口；`planId` 仅作为幂等与追踪预留，后端可返回空字符串。
7. 终点不再支持自定义任意坐标：终点必须从途经点来源点位中指定一个（`photo` 为园区机位、`seasonal` 为窗口树木），且该点位不得同时作为途经点；后端校验终点 id 归属（景区/窗口）且不与途经点重复，不要求终点位于园区缓冲区内。
8. `businessType = photo` 时至少选择 1 个机位途经点；`businessType = seasonal` 时由 `windowKey` 决定窗口，途经点可传空（后端按窗口全量树木生成）或传窗口内树木子集。

## 2. 通用约定

### 2.1 请求与响应

- 接口统一挂载在 `/api` 前缀下。
- 请求与响应均使用 JSON，UTF-8 编码。
- 后端统一返回以下包装：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

`code = 0` 表示业务成功；非 0 表示业务失败。业务失败时 HTTP 状态码使用 `400/401/403/404/500`，`message` 返回可直接展示的中文提示。

### 2.2 鉴权与角色

- 登录接口返回 JWT `token`，前端在 `Authorization: Bearer <token>` 中携带。
- 路线模块所有接口只允许 `visitor` 角色，其他角色返回 `40302`。
- token 失效返回 `40101`。

### 2.3 分页约定

路线模块的静态配置数据（机位点位、观赏窗口、窗口树木）与路径规划结果均不分页：

- 机位点位返回全量数组，当前最多 13 条。
- 观赏窗口返回全量数组，当前最多 5 个。
- 窗口树木返回该窗口在指定园区的全部匹配树木。
- 路径规划结果返回单个 `RoutePlanResult` 对象。

若后续机位数据量增大，再按主契约分页约定补充 `page/pageSize/total/list`，本次不做。

### 2.4 时间格式

沿用主契约：`YYYY-MM-DD HH:mm:ss`，服务器时区 `Asia/Shanghai`。路线模块当前返回字段不含时间，如后续新增收藏、历史记录再补充。

### 2.5 坐标与距离

- 字段名统一为 `longitude`、`latitude`，不使用 `lng/lat`。
- 坐标系为 WGS84（`spatialReference: { wkid: 4326 }`）。
- 存储与返回保留至少 6 位小数。
- 范围：`longitude` 在 `[-180, 180]`，`latitude` 在 `[-90, 90]`。
- 距离字段统一为 `distance` 或 `distanceFromPrevious`，单位米，保留 1 位小数。
- 方向字段 `bearing` 返回中文方位词，如 `东北`、`东南偏右12°`。

### 2.6 错误码

| HTTP | code | 场景 |
|---|---|---|
| 400 | 40001 | 缺少必填参数（`parkId/businessType/start/destination` 等） |
| 400 | 40002 | 参数不合法（坐标越界、`windowKey` 不存在、途经点/终点类型错误、终点与途经点重复、机位途经点不足） |
| 401 | 40101 | 未登录或 token 失效 |
| 403 | 40302 | 非游客访问路线接口 |
| 404 | 40401 | 景区、机位点位或观赏窗口不存在 |
| 500 | 50000 | 服务器内部错误 |

### 2.7 业务枚举

| 枚举 | 内部值 | 中文含义 |
|---|---|---|
| businessType | `photo/seasonal` | 拍照机位路线/季节主题路线 |
| waypointType | `tree/photoSpot` | 树木途经点/机位途经点 |
| parkId | `daxingshansi/tangdacien-temple-park` | 大兴善寺/唐大慈恩寺遗址公园 |

## 3. 数据模型

### 3.1 RoutePark（景区路线方案）

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| parkId | enum | 是 | 景区业务编码 | `daxingshansi` |
| siteId | enum | 是 | 与树木 `siteId` 保持一致 | `daxingshansi` |
| siteName | string | 是 | 景区显示名 | `大兴善寺` |
| centerLongitude | number | 是 | 景区中心经度 | `108.938921` |
| centerLatitude | number | 是 | 景区中心纬度 | `34.228779` |
| radiusM | number | 是 | 缓冲区半径，单位米 | `500` |
| businessTypes | string[] | 是 | 支持的路线类型 | `["photo","seasonal"]` |

### 3.2 PhotoSpot（拍照机位）

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| id | string | 是 | 机位唯一标识 | `DX_spot_001` |
| code | string | 是 | 机位编号，当前与 id 相同 | `DX_spot_001` |
| name | string | 是 | 机位名称 | `红墙` |
| longitude | number | 是 | 经度（WGS84） | `108.9384351` |
| latitude | number | 是 | 纬度（WGS84） | `34.2283844` |
| description | string | 是 | 机位描述 | `山门牌匾、回廊纵深……` |
| suggestion | string | 是 | 出片建议 | `建议早8-10点或下午4点后前往……` |
| siteId | enum | 是 | 所属园区 | `daxingshansi` |
| siteName | string | 是 | 园区显示名 | `大兴善寺` |

列表接口返回上述全量字段，前端详情抽屉直接使用列表数据。

### 3.3 SeasonalWindow（季节观赏窗口）

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| key | string | 是 | 窗口唯一标识 | `3-4` |
| label | string | 是 | 窗口展示名 | `3~4月` |
| species | string[] | 是 | 对应观赏树木的树种列表 | `["樱花","樱桃李","紫藤"]` |

### 3.4 RoutePlanRequest（路线规划请求）

| 字段名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| parkId | enum | 是 | 景区编码，取自园区解析接口 |
| businessType | enum | 是 | `photo/seasonal` |
| windowKey | string | seasonal 必填 | 季节主题路线的观赏窗口 key |
| start | Point | 是 | 起点，`{ longitude, latitude }` |
| destination | Waypoint | 是 | 终点。从途经点来源点位中指定一个：`photo` 为园区机位、`seasonal` 为窗口树木；不得与 `waypoints` 中任一点位重复 |
| waypoints | Waypoint[] | 见说明 | 途经点；photo 至少 1 个，seasonal 可空 |

Waypoint：

| 字段名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| type | enum | 是 | `tree/photoSpot` |
| id | string | 是 | 树木 `Tree.code` 或机位 `PhotoSpot.id` |

请求示例：

```json
{
  "parkId": "daxingshansi",
  "businessType": "photo",
  "start": {
    "longitude": 108.938921,
    "latitude": 34.228779
  },
  "destination": {
    "type": "photoSpot",
    "id": "DX_spot_006"
  },
  "waypoints": [
    {
      "type": "photoSpot",
      "id": "DX_spot_001"
    },
    {
      "type": "photoSpot",
      "id": "DX_spot_003"
    }
  ]
}
```

### 3.5 RoutePlanResult（路线规划结果）

| 字段名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| planId | string | 否 | 预留规划标识，可返回空字符串 |
| totalDistance | number | 是 | 总距离，单位米，保留 1 位小数 |
| estimatedMinutes | number | 是 | 预计步行时间，单位分钟 |
| points | RoutePlanPoint[] | 是 | 有序路线点，首点为起点，末点为终点 |

RoutePlanPoint：

| 字段名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| seq | number | 是 | 序号，从 0 开始 |
| type | enum | 是 | `start/waypoint/destination` |
| refType | enum/null | 否 | 点位来源类型：`tree/photoSpot`；起点为 null，途经点与终点返回对应来源 |
| refId | string/null | 否 | 树木 code 或机位 id；起点为 null |
| label | string | 是 | 展示名，如 `DX_spot_001 / 红墙` |
| longitude | number | 是 | 经度 |
| latitude | number | 是 | 纬度 |
| distanceFromPrevious | number/null | 是 | 与上一个点的距离，首点为 0 |
| bearing | string/null | 否 | 与上一个点的方位，首点为 null |

响应示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "planId": "route-20260812-001",
    "totalDistance": 426.8,
    "estimatedMinutes": 6,
    "points": [
      {
        "seq": 0,
        "type": "start",
        "refType": null,
        "refId": null,
        "label": "当前位置",
        "longitude": 108.938921,
        "latitude": 34.228779,
        "distanceFromPrevious": 0,
        "bearing": null
      },
      {
        "seq": 1,
        "type": "waypoint",
        "refType": "photoSpot",
        "refId": "DX_spot_001",
        "label": "DX_spot_001 / 红墙",
        "longitude": 108.9384351,
        "latitude": 34.2283844,
        "distanceFromPrevious": 62.4,
        "bearing": "西南"
      },
      {
        "seq": 2,
        "type": "destination",
        "refType": "photoSpot",
        "refId": "DX_spot_006",
        "label": "DX_spot_006 / 山门",
        "longitude": 108.9388575,
        "latitude": 34.2271757,
        "distanceFromPrevious": 147.3,
        "bearing": "东南"
      }
    ]
  }
}
```

## 4. 接口明细

### 4.1 路线服务基础

#### 4.1.1 获取景区列表

- 请求：`GET /api/routes/parks`
- 请求参数：无。
- 返回：`data` 为 `RoutePark[]`，返回全部已开通路线景区。
- 权限：仅游客可访问；空数据返回 `data: []`。

响应示例：

```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "parkId": "daxingshansi",
      "siteId": "daxingshansi",
      "siteName": "大兴善寺",
      "centerLongitude": 108.938921,
      "centerLatitude": 34.228779,
      "radiusM": 500,
      "businessTypes": ["photo", "seasonal"]
    },
    {
      "parkId": "tangdacien-temple-park",
      "siteId": "tangdacien-temple-park",
      "siteName": "唐大慈恩寺遗址公园",
      "centerLongitude": 108.96227,
      "centerLatitude": 34.21916,
      "radiusM": 500,
      "businessTypes": ["photo", "seasonal"]
    }
  ]
}
```

#### 4.1.2 根据定位解析景区

- 请求：`GET /api/routes/parks/resolve`
- 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| longitude | number | 是 | 当前定位经度 |
| latitude | number | 是 | 当前定位纬度 |

- 返回：`data` 为 `{ park: RoutePark | null }`；不在任何景区缓冲区内时 `park` 返回 `null`，HTTP 200。
- 异常：缺少坐标 `40001`；坐标越界 `40002`。
- 后端职责：按 `RoutePark.center` 与 `radiusM` 计算距离，命中第一个景区即返回；一个景区同时匹配时按后端配置顺序返回。

响应示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "park": {
      "parkId": "daxingshansi",
      "siteId": "daxingshansi",
      "siteName": "大兴善寺",
      "centerLongitude": 108.938921,
      "centerLatitude": 34.228779,
      "radiusM": 500,
      "businessTypes": ["photo", "seasonal"]
    }
  }
}
```

### 4.2 拍照机位路线

#### 4.2.1 获取园区拍照机位列表

- 请求：`GET /api/routes/parks/:parkId/photo-spots`
- 请求参数：路径参数 `parkId`（景区编码）。
- 返回：`data` 为 `PhotoSpot[]` 全量数组，不分页。
- 异常：景区不存在 `40401`；空数据返回 `data: []`。
- 后端职责：机位数据为园区只读配置，坐标缺失或越界的记录不得返回。

响应示例：

```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "id": "DX_spot_001",
      "code": "DX_spot_001",
      "name": "红墙",
      "longitude": 108.9384351,
      "latitude": 34.2283844,
      "description": "山门牌匾、回廊纵深及大雄宝殿旁红墙竹影是热门打卡点。",
      "suggestion": "建议早8-10点或下午4点后前往，光线柔和且人少。",
      "siteId": "daxingshansi",
      "siteName": "大兴善寺"
    }
  ]
}
```

说明：当前前端机位详情弹窗使用列表中的 `code/name/description/suggestion`，不单独提供详情接口；如后续字段增多，再补充 `GET /api/routes/parks/:parkId/photo-spots/:spotId`。

### 4.3 季节主题路线

#### 4.3.1 获取园区观赏窗口列表

- 请求：`GET /api/routes/parks/:parkId/seasonal-windows`
- 请求参数：路径参数 `parkId`。
- 返回：`data` 为 `SeasonalWindow[]` 全量数组。
- 异常：景区不存在 `40401`；空数据返回 `data: []`。

大兴善寺当前配置：

```json
[
  { "key": "3-4", "label": "3~4月", "species": ["樱花", "樱桃李", "紫藤"] },
  { "key": "6-7", "label": "6~7月", "species": ["女贞"] },
  { "key": "7-8", "label": "7~8月", "species": ["槐树", "国槐"] },
  { "key": "9-10", "label": "9~10月", "species": ["桂花"] },
  { "key": "10-11", "label": "10~11月", "species": ["银杏", "枫树"] }
]
```

唐大慈恩寺遗址公园当前配置：

```json
[
  { "key": "10-11", "label": "10~11月", "species": ["银杏", "枫树"] }
]
```

#### 4.3.2 获取窗口树木列表

- 请求：`GET /api/routes/parks/:parkId/seasonal-windows/:windowKey/trees`
- 请求参数：路径参数 `parkId`、`windowKey`。
- 返回：`data` 为 `{ window: SeasonalWindow, trees: Tree精简版[] }`。
- 异常：景区不存在 `40401`；窗口不存在 `40401`；窗口无匹配树木返回 `trees: []`。
- 后端职责：按 `Tree.siteId == parkId` 且 `Tree.species ∈ window.species` 过滤，返回全量匹配树木；坐标缺失的树木不得返回。

### 4.4 路径规划与导航

#### 4.4.1 路线规划

- 请求：`POST /api/routes/plan`
- 请求参数：见 3.4 `RoutePlanRequest`。
- 返回：`data` 为 `RoutePlanResult`。
- 权限：仅游客可调用。
- 后端职责：
  - 校验 `parkId/businessType/start/destination` 必填。
  - `destination` 必须为 `Waypoint`（`type` + `id`）：`businessType = photo` 时为园区机位，`businessType = seasonal` 时为窗口树木；`destination` 不得与 `waypoints` 中任一点位重复，否则 `40002`。
  - `businessType = photo` 时，`waypoints` 至少 1 个 `photoSpot`，且 id 必须属于该景区，否则 `40002`。
  - `businessType = seasonal` 时，`windowKey` 必须存在；`waypoints` 可空，为空时后端按窗口全量树木生成；传入的 `tree` 必须属于该窗口，否则 `40002`。
  - 起点固定为 `start`，终点固定为 `destination`（指定机位/树木点位，不计入途经点），途经点排序由后端按最短路径算法生成。
  - 当前算法建议：Haversine 距离 + 最近邻 + 2-opt 优化；接入地图路网后仅替换内部计算，不改变请求/响应字段。
  - 返回 `totalDistance`（米，1 位小数）、`estimatedMinutes`（按步行速度约 80 米/分钟向上取整）、有序 `points`。

## 5. 接口清单总表

| 模块 | 接口名称 | 请求方式 | 路径 | 简要说明 |
|---|---|---|---|---|
| 路线服务基础 | 获取景区列表 | GET | `/api/routes/parks` | 返回已开通路线景区与缓冲区配置 |
| 路线服务基础 | 根据定位解析景区 | GET | `/api/routes/parks/resolve` | 按经纬度与缓冲区判断当前景区 |
| 拍照机位路线 | 获取园区拍照机位列表 | GET | `/api/routes/parks/:parkId/photo-spots` | 返回机位点位全量数据 |
| 季节主题路线 | 获取园区观赏窗口列表 | GET | `/api/routes/parks/:parkId/seasonal-windows` | 返回观赏窗口配置 |
| 季节主题路线 | 获取窗口树木列表 | GET | `/api/routes/parks/:parkId/seasonal-windows/:windowKey/trees` | 返回窗口对应树木 |
| 路径规划与导航 | 路线规划 | POST | `/api/routes/plan` | 生成最短路径与导航途经点 |

## 6. 后端必须强制的业务规则

1. 权限规则：路线模块全部接口仅 `visitor` 可访问，巡检/养护调用返回 `40302`。
2. 园区匹配：后端必须使用 `RoutePark.center + radiusM` 判定缓冲区，不信任前端传入的园区判定结果；未命中返回 `park: null`，HTTP 200。
3. 机位数据：只读配置数据，坐标缺失或越界的记录不得返回；删除/编辑机位不提供游客接口。
4. 季节窗口：窗口与树种映射由后端配置维护；窗口树木必须按 `siteId + species` 过滤，前端不做拼装。
5. 途经点与终点校验：`businessType = photo` 至少 1 个机位途经点；`businessType = seasonal` 的 `windowKey` 必须存在；途经点 id 必须属于请求中的景区；`destination` 必须为途经点来源点位之一，且不得与任一途经点重复。
6. 坐标校验：`start` 缺少或越界返回 `40001/40002`；`destination` 为途经点引用（`type`+`id`），由后端解析坐标，不单独传坐标；机位/树木坐标缺失不得进入路线点。
7. 路径计算：起点为 `start`、终点为 `destination`（指定机位/树木点位，不计入途经点）；返回点按实际访问顺序排列，`distanceFromPrevious` 与 `bearing` 由后端计算，前端不自行计算。
8. 不落库：路线规划结果即时返回，不创建路线历史；`planId` 仅作预留，不做强制持久化。

## 7. 路线静态数据与初始化

后端需将以下数据初始化到配置表或缓存中，作为路线模块的数据源：

### 7.1 景区与缓冲区

| parkId | siteName | centerLongitude | centerLatitude | radiusM |
|---|---|---|---|---|
| `daxingshansi` | 大兴善寺 | `108.938921` | `34.228779` | `500` |
| `tangdacien-temple-park` | 唐大慈恩寺遗址公园 | `108.96227` | `34.21916` | `500` |

### 7.2 拍照机位点位

| 园区 | 数量 | 编号示例 |
|---|---|---|
| 大兴善寺 | 7 | `DX_spot_001` ~ `DX_spot_007` |
| 唐大慈恩寺遗址公园 | 6 | `DC_spot_001` ~ `DC_spot_006` |

前端当前完整数据位于 `src/data/photoSpots.js`，字段已统一为 `id/code/name/longitude/latitude/description/suggestion/siteId/siteName`。

### 7.3 季节观赏窗口

见 4.3.1 配置表。树木明细不单独落库，由后端按 `siteId + species` 关联 `GET /api/trees` 数据。

## 8. 前后端职责边界（后端需知）

- 前端职责：移动端页面展示、游客定位采集（浏览器定位或地图选点）、地图点位渲染与高亮、机位详情弹窗、途经点多选与终点指定、导航结果绘制与步骤展示。
- 后端职责：景区与缓冲区配置、园区匹配、机位点位数据、观赏窗口配置、窗口树木过滤、路线规划计算、权限校验。
- 前端当前使用本地常量与本地算法，接入后端后替换为 `4.x` 接口；后端字段命名与主契约保持一致，前端不再维护 `PARK_ZONES` 与 `photoSpots.js` 的重复数据。
- 前端不会在调用规划接口前自行计算最短路径；`RoutePlanResult.points` 的访问顺序以后端返回为准。
- 若后续新增路线收藏、分享、历史记录，需重新补充接口契约；当前版本明确不落库。
