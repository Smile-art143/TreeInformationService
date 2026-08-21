# 后端接口需求补充说明（管理员与移动端游客路线）

> 本文档参照 `BACKEND_API_CONTRACT.md` 的内容模块与形式编写，作为主契约的补充需求，不直接修改主契约。主契约中的通用约定、请求响应包装、分页、时间格式、坐标与距离、文件上传、错误码、树木/工单/游客线索/打卡模型继续生效；本文档只约定新增与需要调整的内容。

## 1. 文档说明

本文档面向后端负责人，覆盖以下业务：

- 加入管理员身份后，注册/登录接口需要的调整。
- Web 端管理员“地图”页面“导出树木 SHP 数据”业务。
- Web 端管理员“审核”页面（注册审核）业务。
- 移动端游客“路线”页面业务，并明确本地 JSON/常量数据需要落库建表；季节主题路线的窗口默认途经点与默认终点（原调试自定义点，坐标为已确定好的固定值）落库后供游客只读使用。

### 1.1 已确认决策

1. 管理员为系统预置账号，不开放注册；注册接口不接受 `role = admin`，登录接口支持 `role = admin`。
2. 管理员 `organizationId` 固定为 `platform`（平台管理组），不参与单位数据隔离；`platform` 不得出现在注册单位下拉中。
3. 注册申请状态扩展为 `pending/approved/rejected`；驳回后账号禁止登录，被驳回账号允许以相同账号和角色重新提交注册申请。
4. 注册审核接口仅 `admin` 可访问，游客/巡检/养护调用返回 `40302`。
5. “导出树木 SHP 数据”仅 `admin` 可访问；导出数据源必须是后端服务器发布的树木数据（GeoScene Server 发布的树木要素服务或其对应的后端数据源），不得使用前端本地树木列表或前端内存数据拼接，坐标缺失的树木不导出。
6. 移动端路线仅 `visitor` 可访问；季节主题路线下游客不可自行在地图上点选途经点/终点（原调试用"自定义途经点/自定义终点"入口对游客关闭），点击"开始导航"后读取后端已初始化的窗口默认途经点与默认终点（固定坐标）。
7. 游客在季节主题路线的观赏窗口下直接点击“开始导航”：起点为游客当前位置，途经点与终点为数据库点位（当前为本地数据，后续落库）。
8. 游客地图只渲染数据库点位与路线规划结果；游客不得自行输入/提交任意坐标点位（仅 `start` 允许坐标），后端返回的窗口默认点位以 `seasonal_window_point` 已初始化坐标为准。
9. 移动端路线涉及的本地 JSON/常量数据全部落库并初始化：`src/data/photoSpots.js`、`MobileRoutesSection.vue` 中的 `PARK_ZONES`、季节观赏窗口、调试点位（localStorage）。具体见第 7 节。
10. 路线规划结果不落库，`planId` 仅作幂等与追踪预留，后端可返回空字符串。

## 2. 通用约定（增量）

### 2.1 鉴权与角色

- 角色枚举扩展为：`visitor`（游客）、`inspector`（巡检人员）、`maintenance`（养护人员）、`admin`（管理员）。
- `token` 载荷保持 `userId/role/organizationId`；管理员 `organizationId` 为 `platform`。
- 管理员权限：查看全部树木档案与工单（只读）、导出树木 SHP 数据、审核巡检/养护注册申请；不参与创建/处置/复核工单，不提供游客线索编辑入口。
- 移动端路线模块全部接口仅 `visitor` 可访问，其他角色返回 `40302`。

### 2.2 错误码增量

| HTTP | code | 场景 |
|---|---|---|
| 403 | 40304 | 账号已被驳回，禁止登录 |
| 409 | 40904 | 注册申请状态冲突（仅 `pending` 可审核） |

其余错误码沿用主契约 `2.7`，其中：

- 注册 `role = admin` 返回 `40002`，提示“管理员为系统预置账号，不开放注册”。
- 驳回注册申请缺少 `reason` 返回 `40001`。
- 审核用户不存在返回 `40401`。
- 游客提交任意坐标点位作为路线途经点/终点返回 `40002`。

### 2.3 业务枚举增量

| 枚举 | 内部值 | 中文含义 |
|---|---|---|
| role | `visitor/inspector/maintenance/admin` | 游客/巡检人员/养护人员/管理员 |
| organizationId | `public/daxingshansi/tangdacien-temple-park/platform` | 公众访问/大兴善寺/唐大慈恩寺遗址公园/平台管理组 |
| approvalStatus | `pending/approved/rejected` | 待审核/已通过/已驳回 |
| businessType | `photo/seasonal` | 拍照机位路线/季节主题路线 |
| waypointType | `tree/photoSpot` | 树木途经点/机位途经点 |
| parkId | `daxingshansi/tangdacien-temple-park` | 大兴善寺/唐大慈恩寺遗址公园 |

## 3. 数据模型增量

### 3.1 User（用户）增量

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| role | enum | 是 | `visitor/inspector/maintenance/admin` | `admin` |
| organizationId | enum | 是 | `public/daxingshansi/tangdacien-temple-park/platform`；巡检/养护限定两个公园，管理员固定 `platform` | `platform` |
| approvalStatus | enum | 是 | `pending/approved/rejected` | `approved` |
| rejectReason | string/null | 否 | 驳回理由，仅管理员审核接口返回 | `材料不完整` |

User 精简版仍不返回 `password`；`rejectReason` 只允许出现在管理员审核列表与驳回结果中。

### 3.2 注册审核列表项

| 字段名 | 类型 | 说明 |
|---|---|---|
| id | string | 用户 id |
| username | string | 用户名/姓名 |
| account | string | 登录账号 |
| role | enum | `inspector/maintenance` |
| organizationId | enum | 申请单位 |
| organizationName | string | 单位显示名 |
| approvalStatus | enum | 列表固定返回 `pending` |
| createdAt | datetime | 注册时间，前端按此展示 |
| updatedAt | datetime | 更新时间 |

### 3.3 树木 SHP 导出字段（DBF）

以下字段与后端服务器发布的树木要素服务保持一致；导出时由业务 API 从后端发布的树木数据读取，前端不参与数据组装。

| 字段名 | 类型 | 长度/精度 | 说明 |
|---|---|---|---|
| ID | C | 24 | 树木业务编号 `Tree.code` |
| SPECIES | C | 40 | 树种名称 |
| DBH | N | 8,2 | 胸径 cm |
| HEALTH | C | 12 | 中文健康状态：正常/待观察/异常 |
| SITE | C | 60 | 园区显示名 `siteName` |
| TYPE | C | 20 | 普通树/古树 |
| PROTECT | C | 20 | 保护等级，非古树为空 |
| LON | N | 18,8 | 经度 WGS84 |
| LAT | N | 18,8 | 纬度 WGS84 |

### 3.4 移动端路线数据模型（落库）

#### 3.4.1 RoutePark（景区路线方案）

| 字段名 | 类型 | 说明 |
|---|---|---|
| parkId | enum | `daxingshansi/tangdacien-temple-park` |
| siteId | enum | 与树木 `siteId` 一致 |
| siteName | string | 景区显示名 |
| centerLongitude | number | 景区中心经度 |
| centerLatitude | number | 景区中心纬度 |
| radiusM | number | 缓冲区半径，当前 500 米 |
| businessTypes | string[] | `["photo","seasonal"]` |

#### 3.4.2 RoutePhotoSpot（拍照机位）

| 字段名 | 类型 | 说明 |
|---|---|---|
| id | string | 机位唯一标识 |
| code | string | 机位编号，当前与 id 相同 |
| name | string | 机位名称 |
| longitude | number | 经度 WGS84 |
| latitude | number | 纬度 WGS84 |
| description | string | 机位描述 |
| suggestion | string | 出片建议 |
| siteId | enum | 所属园区 |
| siteName | string | 园区显示名 |

#### 3.4.3 SeasonalWindow（季节观赏窗口）

| 字段名 | 类型 | 说明 |
|---|---|---|
| parkId | enum | 所属园区 |
| windowKey | string | 窗口唯一标识，如 `3-4` |
| label | string | 展示名，如 `3~4月` |
| species | string[] | 对应树种列表 |

#### 3.4.4 SeasonalWindowPoint（窗口默认路线点，建表）

承载季节路线每个观赏窗口的”默认途经点”与”默认终点”，坐标为调试阶段确定好的固定值（原 `localStorage` 自定义点，清单见第 7.2 节）。游客点击”开始导航”后，后端据此返回 `waypoints`/`destination`：

| 字段名 | 类型 | 说明 |
|---|---|---|
| id | string | 主键 |
| parkId | enum | 所属园区 |
| windowKey | string | 观赏窗口 |
| pointType | enum | `waypoint`/`destination` |
| longitude | number | 经度 WGS84 |
| latitude | number | 纬度 WGS84 |
| label | string | 展示名，`waypoint` 用 `途径点N`，`destination` 用 `终点` |
| sortOrder | number | 途经点顺序；`destination` 固定为最后 |

## 4. 接口明细

### 4.1 认证与用户（管理员适配）

#### 4.1.1 用户注册（调整）

- 请求：`POST /api/auth/register`
- 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| account | string | 是 | 登录账号（手机号或登录账号） |
| username | string | 是 | 用户名/姓名 |
| password | string | 是 | 密码 |
| role | enum | 是 | `visitor/inspector/maintenance`；不接受 `admin` |
| organizationId | enum | 巡检/养护必填 | 仅允许 `daxingshansi` 或 `tangdacien-temple-park` |

- 返回：`data` 为 `User精简版`，必须包含 `approvalStatus`；巡检/养护返回 `pending`，游客返回 `approved`。
- 后端职责：
  - 游客直接 `approved`；巡检/养护默认 `pending`。
  - `role = admin` 返回 `40002`，提示“管理员为系统预置账号，不开放注册”。
  - 账号在当前角色下已存在且状态为 `pending/approved` 返回 `40901`；已驳回账号允许重新注册，重新注册后恢复 `pending`。
  - 巡检/养护未选择单位或选择 `public` 返回 `40003`。
  - 缺少 `username` 返回 `40001`。

#### 4.1.2 用户登录（调整）

- 请求：`POST /api/auth/login`
- 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| account | string | 是 | 登录账号 |
| password | string | 是 | 密码 |
| role | enum | 是 | `visitor/inspector/maintenance/admin` |

- 返回：`data` 为 `{ token: string, user: User精简版 }`。
- 后端职责：
  - 账号、密码或角色不匹配返回 `40102`。
  - `approvalStatus = pending` 返回 `40301`，提示“账号待审核，禁止登录”。
  - `approvalStatus = rejected` 返回 `40304`，提示“账号已被驳回，请联系管理员或重新提交注册申请”。
  - 管理员仅匹配系统预置账号，`approvalStatus` 恒为 `approved`，不参与注册审核流程。
  - token 载荷包含 `userId/role/organizationId`。

#### 4.1.3 获取待审核注册申请列表

- 请求：`GET /api/admin/registrations`
- 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| role | enum | 否 | `inspector/maintenance`，缺省返回全部待审核 |
| keyword | string | 否 | 账号/用户名模糊搜索 |
| page | number | 否 | 默认 1 |
| pageSize | number | 否 | 默认 20；审核页当前传 8 |

- 返回：`data` 为 `PageResult<注册审核列表项>`，只包含 `approvalStatus = pending` 且角色为 `inspector/maintenance` 的申请，按 `createdAt` 倒序。
- 权限：仅 `admin`，其他角色 `40302`。
- 异常：空列表返回 `list: []`、`total: 0`。

#### 4.1.4 通过注册申请

- 请求：`POST /api/admin/registrations/:userId/approve`
- 请求参数：无。
- 返回：`data` 为 `User精简版`，`approvalStatus = approved`。
- 后端职责：
  - 仅 `admin` 可调用，否则 `40302`。
  - 用户不存在返回 `40401`；状态非 `pending` 返回 `40904`。
  - 通过后账号可正常登录。

#### 4.1.5 驳回注册申请

- 请求：`POST /api/admin/registrations/:userId/reject`
- 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| reason | string | 是 | 驳回理由，必须可读并展示给申请人 |

- 返回：`data` 为 `User精简版`，`approvalStatus = rejected`，并返回 `rejectReason`。
- 后端职责：
  - 仅 `admin` 可调用，否则 `40302`。
  - 用户不存在返回 `40401`；状态非 `pending` 返回 `40904`。
  - 缺少 `reason` 返回 `40001`。
  - 驳回后账号禁止登录；同一 `account + role` 允许重新注册。

### 4.2 树木档案与地图（管理员）

#### 4.2.1 导出树木 SHP 数据

- 请求：`GET /api/trees/export/shp`
- 请求参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| siteId | enum | 园区筛选 |
| species | string[] | 树种筛选 |
| healthStatus | enum | `healthy/warning/problem` |
| dbhMin | number | 最小胸径 |
| dbhMax | number | 最大胸径 |
| keyword | string | 树号/树种/位置模糊搜索 |

- 返回：ZIP 文件流，`Content-Type: application/zip`。
ZIP 内包含：
  - `TreePoint.shp`：WGS84（EPSG:4326）Point 要素
  - `TreePoint.shx`
  - `TreePoint.dbf`：UTF-8 编码，字段见 3.3
  - `TreePoint.prj`
  - `TreePoint.cpg`：声明 UTF-8
- 后端职责：
  - 仅 `admin` 可调用，否则 `40302`。
  - 数据来源必须是后端服务器发布的树木数据：读取 GeoScene Server 发布的树木要素服务查询结果，或直接读取该发布服务对应的后端数据源，再组装 SHP；不得使用前端传入的树木列表或前端内存数据。
  - 建议后端通过 `Tree.code` 关联业务库与 GeoScene 要素服务；导出的字段与 GeoScene Server 树木数据发布字段保持一致（见主契约第 7 节及本文档 3.3）。
  - 只导出 `longitude/latitude` 均有效（非空且在范围内）的树木，缺失坐标的树木不进入 SHP。
  - 无满足条件的树木返回 `40002`，提示“没有可导出的树木点位数据”。

### 4.3 移动端游客路线

> 权限：本节全部接口仅 `visitor` 可访问，其他角色 `40302`；token 失效返回 `40101`。

#### 4.3.1 获取景区列表

- 请求：`GET /api/routes/parks`
- 请求参数：无。
- 返回：`data` 为 `RoutePark[]`，返回全部已开通路线景区。

#### 4.3.2 根据定位解析景区

- 请求：`GET /api/routes/parks/resolve`
- 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| longitude | number | 是 | 当前定位经度 |
| latitude | number | 是 | 当前定位纬度 |

- 返回：`data` 为 `{ park: RoutePark | null }`；不在任何景区缓冲区内时 `park` 返回 `null`，HTTP 200。
- 后端职责：按 `RoutePark.center + radiusM` 计算缓冲区，不信任前端传入的园区判定结果。

#### 4.3.3 获取园区拍照机位列表

- 请求：`GET /api/routes/parks/:parkId/photo-spots`
- 请求参数：路径参数 `parkId`。
- 返回：`data` 为 `RoutePhotoSpot[]` 全量数组，不分页。
- 后端职责：机位数据为园区只读配置；坐标缺失/越界的记录不得返回；园区不存在返回 `40401`。

#### 4.3.4 获取园区观赏窗口列表

- 请求：`GET /api/routes/parks/:parkId/seasonal-windows`
- 请求参数：路径参数 `parkId`。
- 返回：`data` 为 `SeasonalWindow[]` 全量数组，不分页。
- 后端职责：窗口与树种映射由后端配置维护；园区不存在返回 `40401`。

#### 4.3.5 获取窗口树木列表

- 请求：`GET /api/routes/parks/:parkId/seasonal-windows/:windowKey/trees`
- 请求参数：路径参数 `parkId`、`windowKey`。
- 返回：`data` 为 `{ window: SeasonalWindow, trees: Tree精简版[] }`。
- 后端职责：按 `Tree.siteId == parkId` 且 `Tree.species ∈ window.species` 过滤；坐标缺失的树木不得返回。

#### 4.3.6 路线规划

- 请求：`POST /api/routes/plan`
- 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| parkId | enum | 是 | 景区编码 |
| businessType | enum | 是 | `photo/seasonal` |
| windowKey | string | seasonal 必填 | 季节主题路线观赏窗口 |
| start | Point | 是 | 起点，`{ longitude, latitude }`，为游客当前位置（浏览器定位或地图选点） |
| destination | Waypoint | photo 必填；seasonal 可空（只能为空，前端页面不提供供游客选择途径点的业务） | 终点；seasonal 为空时后端使用窗口默认终点 |
| waypoints | Waypoint[] | photo 可空；seasonal 可空（只能为空，前端页面不提供供游客选择终点点的业务） | 途经点；seasonal 为空时后端使用窗口默认途经点；photo 为空时仅按起点 + 终点规划 |

Waypoint：

| 字段名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| type | enum | 是 | `tree/photoSpot` |
| id | string | 是 | 树木 `Tree.code` 或机位 `RoutePhotoSpot.id` |

- 返回：`data` 为 `RoutePlanResult`：

| 字段名 | 类型 | 说明 |
|---|---|---|
| planId | string | 预留规划标识，可返回空字符串 |
| totalDistance | number/null | 预留，可返回 `null`；真实总距离由前端调用高德 API 计算 |
| estimatedMinutes | number/null | 预留，可返回 `null`；真实步行时长由前端调用高德 API 计算 |
| points | array | 有序路线点：首点为起点，末点为终点；每点含 `seq/type/refType/refId/label/longitude/latitude`；`distanceFromPrevious`/`bearing` 由前端高德计算，后端可不返回 |

- 后端职责：
  - 校验 `parkId/businessType/start` 必填；`businessType = seasonal` 时 `windowKey` 必填。
  - 任意坐标点位（`{ longitude, latitude }`）只允许出现在 `start`；`waypoints/destination` 必须是数据库点位引用（`type + id`），传入坐标对象返回 `40002`。
  - `businessType = photo` 时，`destination` 必填且为 1 个机位；`waypoints` 可空（游客可不选途经点），非空时为机位数组，机位不得与 `destination` 重复，id 必须属于该景区，否则 `40002`。
  - `businessType = seasonal` 时：
    - `waypoints`、`destination` 为空：后端使用该窗口 `seasonal_window_point` 中已初始化的默认途经点与默认终点（固定坐标，见第 7.2 节）。
    - 传入了点位：仅允许窗口内树木 `code`，`destination` 不得与 `waypoints` 重复，否则 `40002`。
    - 任意用户自定义坐标点位一律拒绝，不参与规划，也不得出现在返回结果中。
  - 途经点排序由后端生成（建议 Haversine + 最近邻 + 2-opt，仅直线距离排序，不涉及路网）。Haversine 计算统一采用地球半径 `6371000` 米（与前端 `haversineDistance` 一致），避免最近邻抉择在前后端出现差异。后端不接路网、不规划真实道路；实际步行路径与导航由前端调用高德 API 完成。
  - 返回的 `points` 仅包含数据库点位（窗口默认点位、机位、窗口树木）；不包含游客自行提交的任意坐标点位（仅 `start` 允许坐标）。
  - 距离、步行时长、方位角由前端调用高德 API 计算；后端仅返回有序点位与坐标，`totalDistance`/`estimatedMinutes`/`distanceFromPrevious`/`bearing` 可返回 `null` 或省略。

请求示例：

```json
{
  "parkId": "daxingshansi",
  "businessType": "seasonal",
  "windowKey": "10-11",
  "start": {
    "longitude": 108.938921,
    "latitude": 34.228779
  }
}
```

响应示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "planId": "",
    "totalDistance": null,
    "estimatedMinutes": null,
    "points": [
      {
        "seq": 0,
        "type": "start",
        "refType": null,
        "refId": null,
        "label": "当前位置",
        "longitude": 108.938921,
        "latitude": 34.228779
      },
      {
        "seq": 1,
        "type": "waypoint",
        "refType": "tree",
        "refId": "DX-101",
        "label": "DX-101 / 银杏",
        "longitude": 108.93921,
        "latitude": 34.22918
      },
      {
        "seq": 2,
        "type": "destination",
        "refType": "tree",
        "refId": "DX-88",
        "label": "DX-88 / 银杏",
        "longitude": 108.94012,
        "latitude": 34.22801
      }
    ]
  }
}
```

## 5. 接口清单总表

| 模块 | 接口名称 | 请求方式 | 路径 | 简要说明 |
|---|---|---|---|---|
| 认证与用户 | 用户注册（调整） | POST | `/api/auth/register` | 支持游客/巡检/养护；管理员不可注册 |
| 认证与用户 | 用户登录（调整） | POST | `/api/auth/login` | 角色增加 `admin`；驳回账号禁止登录 |
| 认证与用户 | 获取待审核注册申请列表 | GET | `/api/admin/registrations` | 管理员审核列表，分页 |
| 认证与用户 | 通过注册申请 | POST | `/api/admin/registrations/:userId/approve` | 待审核转已通过 |
| 认证与用户 | 驳回注册申请 | POST | `/api/admin/registrations/:userId/reject` | 必填理由，转已驳回 |
| 树木档案与地图 | 导出树木 SHP 数据 | GET | `/api/trees/export/shp` | 管理员导出 SHP 压缩包 |
| 路线服务基础 | 获取景区列表 | GET | `/api/routes/parks` | 返回已开通路线景区 |
| 路线服务基础 | 根据定位解析景区 | GET | `/api/routes/parks/resolve` | 按缓冲区匹配景区 |
| 拍照机位路线 | 获取园区拍照机位列表 | GET | `/api/routes/parks/:parkId/photo-spots` | 返回机位点位全量数据 |
| 季节主题路线 | 获取园区观赏窗口列表 | GET | `/api/routes/parks/:parkId/seasonal-windows` | 返回窗口配置 |
| 季节主题路线 | 获取窗口树木列表 | GET | `/api/routes/parks/:parkId/seasonal-windows/:windowKey/trees` | 返回窗口对应树木 |
| 路径规划与导航 | 路线规划 | POST | `/api/routes/plan` | 游客当前定位起点，数据库点位途经/终点 |

## 6. 后端必须强制的业务规则

1. 账号规则：游客注册直接 `approved`；巡检/养护默认 `pending`；管理员系统预置且不开放注册；`pending` 禁止登录（`40301`），`rejected` 禁止登录（`40304`）。
2. 驳回重试：`rejected` 账号允许以相同 `account + role` 重新注册，重新注册后恢复 `pending`；唯一性校验只针对 `pending/approved` 账号。
3. 审核规则：注册审核接口仅 `admin`；仅 `pending` 状态可审核，否则 `40904`；驳回必须填写 `reason`。
4. 导出规则：SHP 导出仅 `admin`；导出数据源必须为后端服务器发布的树木数据（GeoScene Server 发布的树木要素服务或其对应数据源），禁止使用前端列表拼接；ZIP 必须包含 `.shp/.shx/.dbf/.prj/.cpg`，WGS84，DBF UTF-8；坐标缺失树木不导出。
5. 路线权限：路线模块全部接口仅 `visitor`，其他角色 `40302`。
6. 游客点位来源：`waypoints/destination` 必须来自数据库（机位表、树木表、窗口默认点位），拒绝任意坐标点位；只有 `start` 允许提交坐标。
7. 季节路线游客流程：游客选择观赏窗口后直接“开始导航”；`windowKey` 必填，`waypoints/destination` 缺省时后端使用窗口默认配置，不要求游客选择终点。
8. 地图渲染：游客地图只渲染数据库点位与路线规划结果；游客不得自行输入/提交任意坐标点位（仅 `start` 允许坐标），窗口默认点位以 `seasonal_window_point` 已初始化坐标为准。
9. 数据落库：第 7 节列出的本地数据必须建表并初始化；季节路线窗口默认途经点/终点以第 7.2 节坐标清单初始化到 `seasonal_window_point`。
10. 单位隔离：管理员 `organizationId = platform` 不参与单位隔离，可查看全部工单；巡检/养护仍按原主契约隔离。

## 7. 数据库落库清单（后端建表）

以下“当前前端数据”必须由后端建表并初始化，作为正式接口数据源：

| 当前前端数据 | 当前存储位置 | 落库目标 | 是否游客可见 |
|---|---|---|---|
| 景区与缓冲区 `PARK_ZONES` | `MobileRoutesSection.vue` 本地常量 | `route_park` | 是（只读） |
| 拍照机位点位 | `src/data/photoSpots.js`（当前 13 条） | `route_photo_spot` | 是（只读） |
| 季节观赏窗口与树种映射 | `MobileRoutesSection.vue` 本地常量 | `seasonal_window`（含 `species`） | 是（只读） |
| 窗口默认途经点 | `localStorage["tree-service-seasonal-picked-points-v1"]`（原调试自定义点） | `seasonal_window_point`（`pointType=waypoint`） | 是（只读，由后端拼装） |
| 窗口默认终点 | `localStorage["tree-service-seasonal-destinations-v1"]`（原调试自定义终点） | `seasonal_window_point`（`pointType=destination`） | 是（只读，由后端拼装） |
| 路线规划结果 | 前端内存/页面状态 | 不落库 | - |

建表要点：

- `route_park`：`parkId/siteId/siteName/centerLongitude/centerLatitude/radiusM/businessTypes`，按现有数据初始化两个景区。
- `route_photo_spot`：`id/code/name/longitude/latitude/description/suggestion/siteId/siteName`，按 `photoSpots.js` 初始化并补齐 `siteId`。
- `seasonal_window`：`parkId/windowKey/label/species`，按现有窗口配置初始化。
- `seasonal_window_point`：`parkId/windowKey/pointType/longitude/latitude/label/sortOrder`，按第 7.2 节坐标清单初始化；`waypoint` 与 `destination` 均为调试阶段确定好的固定坐标，游客只读。

### 7.1 景区与观赏窗口初始化清单

`route_park` 与 `seasonal_window` 的当前数据来自 `MobileRoutesSection.vue` 的 `PARK_ZONES` 常量，`route_photo_spot` 的当前数据来自 `src/data/photoSpots.js`，后端按下表初始化：

#### route_park（景区）

| parkId | siteId | siteName | centerLongitude | centerLatitude | radiusM | businessTypes |
|---|---|---|---|---|---|---|
| daxingshansi | daxingshansi | 大兴善寺 | 108.938921 | 34.228779 | 500 | `["photo","seasonal"]` |
| tangdacien-temple-park | tangdacien-temple-park | 唐大慈恩寺遗址公园 | 108.96227 | 34.21916 | 500 | `["photo","seasonal"]` |

#### seasonal_window（观赏窗口）

| parkId | windowKey | label | species |
|---|---|---|---|
| daxingshansi | 3-4 | 3~4月 | `["樱花","樱桃李","紫藤"]` |
| daxingshansi | 6-7 | 6~7月 | `["女贞"]` |
| daxingshansi | 7-8 | 7~8月 | `["槐树","国槐"]` |
| daxingshansi | 9-10 | 9~10月 | `["桂花"]` |
| daxingshansi | 10-11 | 10~11月 | `["银杏","枫树"]` |
| tangdacien-temple-park | 10-11-1 | 10~11月 | `["银杏","枫树"]` |

#### route_photo_spot（拍照机位）

`route_photo_spot` 当前数据来自 `src/data/photoSpots.js`（13 条），后端按下表初始化并补齐 `siteId`（`DX_*` → `daxingshansi`，`DC_*` → `tangdacien-temple-park`）。`description`/`suggestion` 照搬 `photoSpots.js` 原文，坐标为 WGS84，小数位按原文保留。

| id | code | name | siteId | siteName | longitude | latitude |
|---|---|---|---|---|---|---|
| DX_spot_001 | DX_spot_001 | 红墙 | daxingshansi | 大兴善寺 | 108.9384351 | 34.2283844 |
| DX_spot_002 | DX_spot_002 | 白鸽广场 | daxingshansi | 大兴善寺 | 108.9391846 | 34.2282501 |
| DX_spot_003 | DX_spot_003 | 转经筒长廊 | daxingshansi | 大兴善寺 | 108.9383573 | 34.2291806 |
| DX_spot_004 | DX_spot_004 | 放生池 | daxingshansi | 大兴善寺 | 108.93847 | 34.2294068 |
| DX_spot_005 | DX_spot_005 | 大雄宝殿台阶 | daxingshansi | 大兴善寺 | 108.9386899 | 34.2283367 |
| DX_spot_006 | DX_spot_006 | 山门 | daxingshansi | 大兴善寺 | 108.9388575 | 34.2271757 |
| DX_spot_007 | DX_spot_007 | 猫猫神像 | daxingshansi | 大兴善寺 | 108.9387086 | 34.2288323 |
| DC_spot_001 | DC_spot_001 | 佛塔同框 | tangdacien-temple-park | 唐大慈恩寺遗址公园 | 108.9621155 | 34.2194894 |
| DC_spot_002 | DC_spot_002 | 松柏林与石佛 | tangdacien-temple-park | 唐大慈恩寺遗址公园 | 108.9615456 | 34.2197079 |
| DC_spot_003 | DC_spot_003 | 长廊延伸 | tangdacien-temple-park | 唐大慈恩寺遗址公园 | 108.9619921 | 34.2201392 |
| DC_spot_004 | DC_spot_004 | 池塘亭台 | tangdacien-temple-park | 唐大慈恩寺遗址公园 | 108.9625191 | 34.218814 |
| DC_spot_005 | DC_spot_005 | 曲径小道 | tangdacien-temple-park | 唐大慈恩寺遗址公园 | 108.9625901 | 34.2193773 |
| DC_spot_006 | DC_spot_006 | 大草坪 | tangdacien-temple-park | 唐大慈恩寺遗址公园 | 108.9619412 | 34.2194151 |

### 7.2 窗口默认路线点初始化清单（坐标，WGS84，保留 6 位小数）

以下坐标来自调试阶段确定好的 `localStorage` 数据，后端初始化 `seasonal_window_point` 时按下表逐行写入。`sortOrder` 为游客导航途经点顺序；每个窗口仅一条 `destination`。`label` 由后端按 `pointType` 生成：`waypoint` 为「观赏点N」（N 为 `sortOrder`），`destination` 为「终点」。

#### 大兴善寺（parkId = `daxingshansi`）

| windowKey | pointType | sortOrder | longitude | latitude |
|---|---|---|---|---|
| 3-4 | waypoint | 1 | 108.939211 | 34.228801 |
| 3-4 | waypoint | 2 | 108.939477 | 34.228082 |
| 3-4 | waypoint | 3 | 108.938811 | 34.228967 |
| 3-4 | destination | - | 108.938795 | 34.229213 |
| 6-7 | waypoint | 1 | 108.939802 | 34.228096 |
| 6-7 | waypoint | 2 | 108.939218 | 34.228081 |
| 6-7 | destination | - | 108.939249 | 34.228319 |
| 7-8 | waypoint | 1 | 108.938954 | 34.228218 |
| 7-8 | waypoint | 2 | 108.938863 | 34.228940 |
| 7-8 | waypoint | 3 | 108.938520 | 34.228941 |
| 7-8 | destination | - | 108.938629 | 34.229483 |
| 9-10 | waypoint | 1 | 108.938745 | 34.228067 |
| 9-10 | waypoint | 2 | 108.939033 | 34.228069 |
| 9-10 | waypoint | 3 | 108.938947 | 34.228622 |
| 9-10 | waypoint | 4 | 108.938422 | 34.228660 |
| 9-10 | destination | - | 108.938474 | 34.228236 |
| 10-11 | waypoint | 1 | 108.939064 | 34.228082 |
| 10-11 | waypoint | 2 | 108.939232 | 34.228481 |
| 10-11 | waypoint | 3 | 108.939156 | 34.229279 |
| 10-11 | destination | - | 108.938439 | 34.228004 |

#### 唐大慈恩寺遗址公园（parkId = `tangdacien-temple-park`）

| windowKey | pointType | sortOrder | longitude | latitude |
|---|---|---|---|---|
| 10-11-1 | waypoint | 1 | 108.962341 | 34.218798 |
| 10-11-1 | destination | - | 108.962184 | 34.218548 |

## 8. 前后端职责边界（后端需知）

- 前端职责：登录/注册表单按本文档 4.1 调整；管理员审核页调用 `/api/admin/registrations` 系列接口；管理员地图页调用 `GET /api/trees/export/shp` 并下载返回文件，不再在前端本地生成 SHP；移动端游客路线页调用 `/api/routes/*`，并将当前本地 `photoSpots.js`、`PARK_ZONES`、观赏窗口、窗口默认点位（原 localStorage 自定义点）数据移除/改为接口数据。
- 后端职责：数据库中新建表并初始化第 7 节数据；实现管理员审核；SHP 导出从后端服务器发布的树木数据（GeoScene Server 发布服务）读取并组装；实现景区解析、机位/窗口数据、窗口树木过滤、路线规划与权限校验；任何游客接口不得接收/返回自定义坐标点位。
- 窗口默认点位归属：季节路线窗口默认途经点/终点为后端初始化配置（坐标为调试阶段确定好的固定值，见 7.2），游客只读；游客不可自行输入/提交任意坐标点位，前端正式游客视图不再提供点选入口。
- 本文档是 `BACKEND_API_CONTRACT.md` 的补充，不修改主契约；后端对接时以主契约 + 本文档为准。
