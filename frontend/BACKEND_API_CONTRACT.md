# 后端接口统一对接说明

## 1. 文档说明

本文档供后端服务开发与 GeoScene Server 树木数据发布使用，是前后端接口对接的统一契约。业务后端接口统一挂载在 `/api` 前缀下；树木地理数据由 GeoScene Server 发布要素服务，业务 API 负责权限、业务规则与事务。

### 1.1 已确认决策

以下决策已与前端确认，后端按此实现，不再需要产品侧二次确认：

1. 游客注册后直接 `approved`，登录即可使用；巡检/养护注册后默认 `pending`，待审核账号禁止登录（`40301`）。
2. 树木列表一次返回全量 437 条，不做后端分页；筛选由前端本地完成。
3. 游客线索编辑与转工单拆分为两个接口：`PUT /api/visitor-leads/:id` 负责编辑，`POST /api/visitor-leads/:id/convert` 负责转工单，convert 不再携带编辑参数。
4. 已转工单的游客线索允许删除，删除不影响已生成的工单。
5. 统计接口中，游客看到的 `workOrderCount` 为全部工单数；巡检/养护按本人单位隔离统计。
6. 业务实体照片统一使用 `photos: Photo[]`，不保留 `photoUrl` 兼容字段；树木要素服务未增加 `coverPhotoUrl` 字段。
7. 工单保留 `created` 枚举用于兼容，但创建接口直接生成 `processing`。
8. 打卡排行与树种图鉴由前端从打卡列表派生，后端不提供 leaderboard/atlas 接口。

## 2. 通用约定

### 2.1 请求与响应

- 接口统一挂载在 `/api` 前缀下，例如 `POST /api/auth/login`。
- 请求与响应均使用 JSON，UTF-8 编码。
- 后端统一返回以下包装，HTTP 状态码与业务码同时使用：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

约定：

- `code = 0` 表示业务成功；非 0 表示业务失败。
- 业务失败时，HTTP 状态码使用 `400/401/403/404/409/500`，`message` 必须返回可直接展示的中文提示。
- 校验类错误可携带可选字段 `data`，例如 `{ code: 40001, message: "缺少必填参数", data: { field: "treeId" } }`。

### 2.2 鉴权与角色

- 登录接口返回 JWT `token`，前端在 `Authorization: Bearer <token>` 中携带。
- `token` 中至少包含 `userId`、`role`、`organizationId`；失效后返回 `40101`。
- 角色枚举：`visitor`（游客）、`inspector`（巡检人员）、`maintenance`（养护人员）。
- 权限约定：
  - 游客：地图、树木详情、导览、打卡、提交游客线索；不可访问工单相关接口。
  - 巡检人员：查看游客线索、创建工单、复核工单、编辑树木档案。
  - 养护人员：创建工单、处置工单、编辑树木档案。
- 单位数据隔离是后端强制规则：巡检/养护人员只能访问「树木位置（`siteId`）」与本人 `organizationId` 一致的工单，列表、详情、处置、复核接口都必须校验，不能只靠前端隐藏。
- 注册审核：游客直接 `approved`；巡检/养护默认 `pending`，`pending` 账号调用登录返回 `40301`。
- 前端角色切换器已移除，不再提供“不重新登录直接切换角色”的机制；每次切换角色都必须重新登录获取新 token。

### 2.3 分页约定

除树木列表外，所有列表接口统一分页：

| 参数/字段 | 类型 | 说明 |
|---|---|---|
| `page` | number | 页码，从 1 开始，默认 1 |
| `pageSize` | number | 每页条数，默认 20；工单表格当前传 8，打卡列表默认 50 |
| `total` | number | 总条数（返回字段） |
| `list` | array | 当前页数据（返回字段） |

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [],
    "total": 0,
    "page": 1,
    "pageSize": 20
  }
}
```

例外：`GET /api/trees` 按已确认决策返回全量数组，不使用 `PageResult`。

### 2.4 时间格式

- 统一使用 `YYYY-MM-DD HH:mm:ss`（24 小时制）。
- 服务器时区建议为 `Asia/Shanghai`。
- 所有时间字段由后端统一输出，前端不做格式化。

### 2.5 坐标与距离

- 字段名统一为 `longitude`、`latitude`，不使用 `lng/lat`。
- 坐标系为 WGS84（GeoScene 中 `spatialReference: { wkid: 4326 }`）。
- 存储与返回保留至少 6 位小数。
- 范围：`longitude` 在 `[-180, 180]`，`latitude` 在 `[-90, 90]`。
- 距离字段统一为 `distance`，单位米，保留 1 位小数，仅在周边查询接口返回。

### 2.6 文件上传与照片

- 后端提供统一上传接口 `POST /api/files`，所有图片必须先上传、后提交业务数据。
- 后端只保存可公开访问的图片 URL，建议使用 MinIO / 阿里云 OSS / 腾讯 COS / CDN；正式环境使用 `https` 永久链接。
- 业务实体图片字段统一为 `photos: Photo[]`；打卡记录也使用 `photos: Photo[]`（当前最多 1 张），不再返回 `photoUrl`。
- `uid` 由前端生成，后端返回 `{ name, url, size, type }` 即可；若后端返回 `uid`，前端优先使用后端值。
- 业务接口不得接受 `blob:`、本地路径或带时效的临时 URL 作为图片地址；后端应校验 `url` 必须来自本系统上传接口。

### 2.7 错误码

| HTTP | code | 场景 |
|---|---|---|
| 400 | 40001 | 缺少必填参数 |
| 400 | 40002 | 参数不合法（坐标越界、radius 为负等） |
| 400 | 40003 | 内部角色必须选择「大兴善寺」或「唐大慈恩寺遗址公园」 |
| 401 | 40101 | 未登录或 token 失效 |
| 401 | 40102 | 账号、密码或角色不匹配 |
| 403 | 40301 | 账号待审核，禁止登录 |
| 403 | 40302 | 角色无权限执行该操作 |
| 403 | 40303 | 工单树木位置与用户单位不一致，不可见/不可操作 |
| 404 | 40401 | 资源不存在（树木、工单、线索、打卡记录） |
| 409 | 40901 | 账号在当前角色下已存在 |
| 409 | 40902 | 工单状态冲突（并发处置/复核） |
| 409 | 40903 | 游客线索已转工单，不能重复转换 |
| 500 | 50000 | 服务器内部错误 |

## 3. 数据模型

### 3.1 User（用户）

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| id | string | 是 | 用户唯一标识 | `user-10001` |
| username | string | 是 | 用户名/姓名，注册必填；工单创建/处置/复核自动填入 | `巡检员小王` |
| account | string | 是 | 登录账号，同角色下唯一 | `inspector` |
| password | string | 是（仅写入） | 密码，任何接口不得返回 | `123456` |
| role | enum | 是 | `visitor/inspector/maintenance` | `inspector` |
| organizationId | enum | 内部角色必填 | `public/daxingshansi/tangdacien-temple-park`；巡检/养护限定为两个公园 | `daxingshansi` |
| organizationName | string | 是 | 单位显示名，由 `organizationId` 派生 | `大兴善寺` |
| approvalStatus | enum | 是 | `pending/approved` | `approved` |
| createdAt | datetime | 是 | 注册时间 | `2026-07-28 10:00:00` |
| updatedAt | datetime | 否 | 更新时间 | `2026-07-28 10:00:00` |

User 精简版返回字段：`id/username/account/role/organizationId/organizationName/approvalStatus/createdAt`，不返回 `password`。

### 3.2 Tree（树木）

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| id | string | 是 | 树木唯一标识 | `DX-1` |
| code | string | 是 | 树木业务编号，后端生成，格式建议 `<园区前缀>-<序号>` | `DX-438` |
| species | string | 是 | 树种名称 | `银杏` |
| dbh | number | 是 | 胸径，单位 cm | `24.2` |
| longitude | number | 是 | 经度（WGS84） | `108.9339495` |
| latitude | number | 是 | 纬度（WGS84） | `34.2292664` |
| siteId | enum | 是 | 所属园区：`daxingshansi/tangdacien-temple-park` | `daxingshansi` |
| siteName | string | 是 | 园区显示名，由 `siteId` 派生 | `大兴善寺` |
| treeType | enum | 是 | `普通树/古树` | `普通树` |
| isAncient | boolean | 是 | 是否古树，由 `treeType === "古树"` 派生 | `false` |
| protectionLevel | enum/null | 古树必填 | `一级保护/二级保护/三级保护` | `二级保护` |
| healthStatus | enum | 是 | `healthy/warning/problem` | `warning` |
| locationDescription | string | 否 | 相对位置描述 | `山门东侧第三排` |
| photos | Photo[] | 否 | 树木照片 | `[{uid,name,url,size,type}]` |
| story | string | 否 | 资料卡片 | `常绿乔木，姿态挺拔……` |
| remark | string | 否 | 备注 | `` |
| createdAt | datetime | 否 | 建档时间 | `2026-07-28 10:00:00` |
| updatedAt | datetime | 否 | 更新时间 | `2026-07-28 10:00:00` |
| distance | number | 否 | 与查询点的距离，单位米，仅 nearby 接口返回 | `12.3` |

Tree 精简版返回字段：`id/code/species/dbh/longitude/latitude/siteId/siteName/treeType/isAncient/protectionLevel/healthStatus/locationDescription/photos`，不包含 `story/remark`。

### 3.3 WorkOrder（工单）

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| id | string | 是 | 工单唯一标识 | `wo-1` |
| orderNo | string | 是 | 工单编号，后端生成 | `WO-20260728-001` |
| treeId | string | 是 | 关联树木 id | `DX-1` |
| siteId | enum | 是 | 树木位置快照，创建时取自 Tree.siteId；用于单位隔离 | `daxingshansi` |
| status | enum | 是 | `created/processing/reviewing/archived` | `processing` |
| issueType | enum | 是 | `病虫害/倾斜/枯枝/根系隆起/树皮损伤/长势异常` | `病虫害` |
| issueDescription | string | 是 | 问题描述 | `发现蚜虫，需要养护确认` |
| locationDescription | string | 否 | 相对位置 | `碑亭北侧` |
| creatorId | string | 是 | 创建人用户 id，后端从 token 填充 | `user-10001` |
| creatorName | string | 是 | 创建人用户名，自动填充 `User.username` | `巡检员小王` |
| creatorRole | enum | 是 | 创建时角色快照 | `inspector` |
| handlerId | string | 否 | 处置人用户 id | `user-10002` |
| handlerName | string | 否 | 处置人用户名 | `养护老李` |
| reviewerId | string | 否 | 复核人用户 id | `user-10001` |
| reviewerName | string | 否 | 复核人用户名 | `巡检员小王` |
| reviewResult | enum/null | 否 | `passed/rework` | `passed` |
| reviewHealthStatus | enum/null | 否 | 复核后健康状态 | `warning` |
| reviewComment | string | 否 | 复核意见 | `处置效果达标，归档。` |
| createPhotos | Photo[] | 是 | 创建照片，最多 4 张 | `[{uid,name,url}]` |
| treatmentMeasures | string | 否 | 处置措施 | `已完成现场清理并设置继续观察标记。` |
| treatmentPhotos | Photo[] | 否 | 处置照片，最多 4 张 | `[{uid,name,url}]` |
| sourceLeadId | string | 否 | 来源游客线索 id | `lead-1` |
| createdAt | datetime | 是 | 创建时间 | `2026-07-28 10:00:00` |
| processedAt | datetime | 否 | 处置时间 | `2026-07-28 15:30:00` |
| reviewedAt | datetime | 否 | 复核时间 | `2026-07-28 16:30:00` |
| archivedAt | datetime | 否 | 归档时间 | `2026-07-28 16:30:00` |
| updatedAt | datetime | 否 | 最后更新时间 | `2026-07-28 16:30:00` |

列表接口返回 WorkOrder 精简版，裁剪字段：`issueDescription/locationDescription/createPhotos/treatmentMeasures/treatmentPhotos/reviewComment/reviewResult/reviewHealthStatus/sourceLeadId`，并返回 `tree: { code, species, healthStatus }` 摘要。详情接口返回完整版并返回 `tree: { code, species, dbh, healthStatus }`。

### 3.4 VisitorLead（游客线索）

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| id | string | 是 | 线索唯一标识 | `lead-1` |
| leadNo | string | 是 | 线索编号，后端生成 | `LEAD-20260728-001` |
| treeId | string | 是 | 关联树木 id | `DX-1` |
| siteId | enum | 是 | 树木位置快照 | `daxingshansi` |
| status | enum | 是 | `new/converted` | `new` |
| issueType | enum | 是 | 问题类型 | `病虫害` |
| issueDescription | string | 是 | 问题描述 | `游客反馈附近存在异常现象` |
| locationDescription | string | 否 | 相对位置 | `山门东侧` |
| healthStatus | enum | 否 | 巡检编辑时补充的健康状态 | `problem` |
| photos | Photo[] | 是 | 现场照片，最多 3 张 | `[{uid,name,url}]` |
| submitterId | string | 是 | 提交人用户 id | `user-10003` |
| submitterName | string | 是 | 提交人用户名 | `游客` |
| createdAt | datetime | 是 | 提交时间 | `2026-07-28 11:20:00` |
| convertedAt | datetime | 否 | 转工单时间 | `2026-07-28 12:00:00` |
| convertedOrderId | string | 否 | 转换后的工单 id | `wo-9` |
| updatedAt | datetime | 否 | 更新时间 | `2026-07-28 12:00:00` |

说明：当前不单独提供线索详情接口，列表接口返回包含 `photos` 在内的全量字段，前端详情抽屉直接使用列表数据。

### 3.5 CheckInRecord（打卡记录）

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| id | string | 是 | 打卡记录唯一标识 | `ci-1` |
| treeId | string | 是 | 关联树木 id | `DX-1` |
| treeCode | string | 是 | 树木编号快照 | `DX-1` |
| species | string | 是 | 树种快照 | `松树` |
| photos | Photo[] | 是 | 打卡照片，当前最多 1 张 | `[{uid,name,url}]` |
| userName | string | 是 | 打卡人用户名 | `游客` |
| likedBy | string[] | 是 | 点赞人 id 列表 | `["user-10001"]` |
| likeCount | number | 是 | 点赞数，派生字段 | `1` |
| createdAt | datetime | 是 | 打卡时间 | `2026-08-05 14:30:00` |

### 3.6 Photo（附件）

| 字段名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| uid | string | 是 | 前端组件 key，由前端生成 |
| name | string | 是 | 文件名/展示名 |
| url | string | 是 | 可访问的图片地址 |
| size | number | 否 | 文件大小（字节） |
| type | string | 否 | MIME 类型 |

### 3.7 Organization（单位/园区）

| 字段名 | 类型 | 说明 |
|---|---|---|
| id | enum | `public/daxingshansi/tangdacien-temple-park` |
| name | string | `公众访问/大兴善寺/唐大慈恩寺遗址公园` |

注册下拉只返回 `daxingshansi` 与 `tangdacien-temple-park`，不返回 `public`。

### 3.8 Stats（统计）

| 字段名 | 类型 | 说明 |
|---|---|---|
| totalTrees | number | 树木总数 |
| speciesCount | number | 树种数量 |
| speciesRatio | array | `[{species,count,percentage}]`，按数量降序 |
| dbhDistribution | array | `[{range,count}]`，区间 `0-15/15-30/30-50/50-80/80+` |
| siteComparison | array | `[{siteId,siteName,species,count}]` |
| ecologicalBenefits | object | `carbonStorage/carbonSequestration/oxygenProduction/stormwaterIntercepted/airPollutionRemoved` |
| ancientCount | number | 古树数量 |
| workOrderCount | number | 工单数量；游客显示全部，巡检/养护按单位隔离 |

### 3.9 枚举统一

| 枚举 | 内部值 | 中文含义 |
|---|---|---|
| role | `visitor/inspector/maintenance` | 游客/巡检人员/养护人员 |
| organizationId | `public/daxingshansi/tangdacien-temple-park` | 公众访问/大兴善寺/唐大慈恩寺遗址公园 |
| approvalStatus | `pending/approved` | 待审核/已通过 |
| treeType | `普通树/古树` | 普通树/古树 |
| protectionLevel | `一级保护/二级保护/三级保护` | 保护等级 |
| healthStatus | `healthy/warning/problem` | 正常/待观察/异常 |
| workOrderStatus | `created/processing/reviewing/archived` | 已创建/待处置/待复核/已归档 |
| leadStatus | `new/converted` | 新线索/已转工单 |
| reviewResult | `passed/rework` | 通过/退回 |
| issueType | `病虫害/倾斜/枯枝/根系隆起/树皮损伤/长势异常` | 问题类型 |

### 3.10 工单状态流转

```text
创建工单（巡检/养护）          -> processing        （POST /api/work-orders）
processing --养护提交处置-->    -> reviewing         （PATCH /api/work-orders/:id/process；树木 healthStatus 自动置为 warning）
reviewing --巡检复核通过-->     -> archived          （PATCH /api/work-orders/:id/review；树木 healthStatus 更新为复核值）
reviewing --巡检复核退回-->     -> processing        （同上，reviewResult = rework）
游客线索 new --巡检转工单-->    -> converted         （POST /api/visitor-leads/:id/convert；同时生成 processing 工单）
```

说明：

- `created` 仅保留用于枚举兼容，所有创建入口直接生成 `processing`。
- 每个状态流转节点都由后端接口驱动，前端不再直接改写状态。
- 树木健康状态在“创建工单、提交处置、复核、线索转工单”中的变更必须由后端在同一事务内原子更新，避免前后端状态不一致。
- 同一工单并发处置/复核属于状态冲突场景，后端需要做乐观锁或事务控制，返回 `40902`。

## 4. 接口明细

### 4.1 认证与用户

#### 4.1.1 用户注册

- 请求：`POST /api/auth/register`
- 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| account | string | 是 | 登录账号 |
| username | string | 是 | 用户名，注册必填 |
| password | string | 是 | 密码 |
| role | enum | 是 | `visitor/inspector/maintenance` |
| organizationId | enum | 巡检/养护必填 | 仅允许 `daxingshansi` 或 `tangdacien-temple-park` |

- 返回：`data` 为 `User精简版`，必须包含 `approvalStatus` 字段；巡检/养护注册成功返回 `pending`，前端据此弹出“注册成功，请等待管理员审核”；游客注册成功返回 `approved`，可直接登录。
- 后端职责：
  - 游客直接 `approved`；巡检/养护默认 `pending`。
  - 账号在当前角色下已存在返回 `40901`。
  - 巡检/养护未选择单位或选择 `public` 返回 `40003`。
  - 缺少 `username` 返回 `40001`。

巡检/养护注册成功响应示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "user-10001",
    "username": "巡检员小王",
    "account": "inspector",
    "role": "inspector",
    "organizationId": "daxingshansi",
    "organizationName": "大兴善寺",
    "approvalStatus": "pending",
    "createdAt": "2026-07-28 10:00:00"
  }
}
```

游客注册成功时，`data.approvalStatus` 返回 `approved`，其余字段结构一致。

#### 4.1.2 用户登录

- 请求：`POST /api/auth/login`
- 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| account | string | 是 | 登录账号 |
| password | string | 是 | 密码 |
| role | enum | 是 | `visitor/inspector/maintenance` |

- 返回：`data` 为 `{ token: string, user: User精简版 }`。
- 后端职责：
  - 账号、密码或角色不匹配返回 `40102`，提示“账号、密码或角色不匹配”。
  - `approvalStatus = pending` 返回 `40301`，提示“账号待审核，禁止登录”。
  - token 载荷包含 `userId/role/organizationId`。

#### 4.1.3 获取当前用户

- 请求：`GET /api/auth/me`
- 请求参数：无，token 从 header 获取。
- 返回：`data` 为 `User精简版`。
- 异常：token 失效返回 `40101`。

#### 4.1.4 退出登录

- 请求：`POST /api/auth/logout`
- 请求参数：无。
- 返回：`data: null`。
- 后端职责：token 已失效时仍返回成功，前端照常清空本地状态。

#### 4.1.5 获取单位选项

- 请求：`GET /api/organizations`
- 请求参数：无。
- 返回：`data` 为 `Organization[]`，只包含 `daxingshansi`、`tangdacien-temple-park`。

### 4.2 树木档案与地图

#### 4.2.1 获取树木列表

- 请求：`GET /api/trees`
- 请求参数（可选，前端当前本地筛选，可不传）：

| 参数 | 类型 | 说明 |
|---|---|---|
| keyword | string | 树号/树种/位置模糊搜索 |
| species | string[] | 树种筛选（多选） |
| healthStatus | enum | `healthy/warning/problem` |
| dbhMin | number | 最小胸径 |
| dbhMax | number | 最大胸径 |
| siteId | enum | 园区筛选 |

- 返回：`data` 为 `Tree精简版[]` 全量数组，不分页，共 437 条；坐标缺失的树木不得出现在地图点位。
- 无数据返回 `data: []`，HTTP 200。

#### 4.2.2 获取树木详情

- 请求：`GET /api/trees/:id`
- 请求参数：路径参数 `id`。
- 返回：`data` 为 `Tree完整版`（含 `story/remark/photos`）。
- 异常：不存在返回 `40401`。

#### 4.2.3 新增树木

- 请求：`POST /api/trees`
- 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| species | string | 是 | 树种名称 |
| dbh | number | 否 | 胸径 cm |
| longitude | number | 是 | 经度 |
| latitude | number | 是 | 纬度 |
| siteId | enum | 是 | `daxingshansi/tangdacien-temple-park` |
| locationDescription | string | 否 | 相对位置，不能作为 siteName |
| treeType | enum | 是 | `普通树/古树` |
| protectionLevel | enum | 古树必填 | `一级保护/二级保护/三级保护` |
| healthStatus | enum | 是 | `healthy/warning/problem` |
| story | string | 否 | 资料卡片 |
| photos | Photo[] | 否 | 已上传照片 |

- 返回：`data` 为 `Tree完整版`。
- 后端职责：生成 `code`（建议 `<园区前缀>-<序号>`）；校验坐标范围；古树必须填写保护等级；`siteName` 由 `siteId` 派生，不接受前端传入。
- 异常：缺少坐标或坐标越界 `40002`；古树未填保护等级 `40002`；`siteId` 缺失或非法 `40001/40002`。
- 权限：巡检/养护可新增；游客 `40302`。

#### 4.2.4 更新树木档案

- 请求：`PATCH /api/trees/:id`
- 请求参数（部分更新）：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| species | string | 否 | 树种 |
| dbh | number | 否 | 胸径 |
| story | string | 否 | 资料卡片 |
| healthStatus | enum | 否 | 健康状态 |
| photos | Photo[] | 否 | 完整照片数组，追加/删除由前端组装后提交 |

- 返回：`data` 为 `Tree完整版`。
- 异常：不存在 `40401`；`healthStatus` 非法 `40002`。
- 权限：巡检/养护可编辑；游客 `40302`。
- 注意：工单流程中的健康状态变更由工单接口在后端事务内完成，前端不应通过本接口重复修改。

#### 4.2.5 周边树木查询

- 请求：`GET /api/trees/nearby`
- 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| latitude | number | 是 | 查询点纬度 |
| longitude | number | 是 | 查询点经度 |
| radius | number | 是 | 半径，单位米 |
| page | number | 否 | 默认 1 |
| pageSize | number | 否 | 默认 20 |

- 返回：`data` 为 `PageResult<Tree精简版 + distance>`，按 `distance` 升序；`distance` 由后端动态计算，不落库。
- 异常：坐标缺失/越界、radius 非正数返回 `40002`；范围内无树返回 `list: []`。

### 4.3 文件

#### 4.3.1 文件上传

- 请求：`POST /api/files`
- 请求体：`multipart/form-data`，字段 `file`（图片文件），可选字段 `bizType`（`tree/order/lead/checkin`）。
- 返回：`data` 为 `Photo`，至少 `{ name, url, size, type }`；`uid` 由前端生成。
- 异常：非图片类型 `40002`（限制 `image/*`）；文件过大返回 `413`，提示文案可展示。

### 4.4 统计看板

#### 4.4.1 获取树木统计概览

- 请求：`GET /api/stats/overview`
- 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| siteId | enum | 否 | 按园区过滤，缺省为全部 |

- 返回：`data` 为 `Stats`。
- 后端职责：`workOrderCount` 游客显示全部，巡检/养护按本人 `organizationId` 隔离统计；树木列表为空时各计数为 0，`percentage` 为 0，不允许除零报错。

### 4.5 工单管理

#### 4.5.1 获取工单列表

- 请求：`GET /api/work-orders`
- 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| status | enum | 否 | `created/processing/reviewing/archived` |
| keyword | string | 否 | 工单号/树木编号模糊搜索 |
| treeId | string | 否 | 按树木过滤 |
| mine | boolean | 否 | 只看当前用户待处理/待复核 |
| siteId | enum | 否 | 按园区过滤；后端必须强制叠加当前用户单位范围 |
| page | number | 否 | 默认 1 |
| pageSize | number | 否 | 默认 20 |

- 返回：`data` 为 `PageResult<WorkOrder精简版>`，并附带 `stats: { created, processing, reviewing, archived }`。
- 异常：
  - 游客访问 `40302`。
  - 单位隔离：巡检/养护只能看到 `WorkOrder.siteId == 当前用户.organizationId` 的工单；越权列表返回空列表与 `total: 0`。
  - 空列表返回 `list: []`、`total: 0`、stats 全 0。

#### 4.5.2 获取工单详情

- 请求：`GET /api/work-orders/:id`
- 请求参数：路径参数 `id`。
- 返回：`data` 为 `WorkOrder完整版`，并返回 `tree: { code, species, dbh, healthStatus }` 摘要。
- 异常：不存在 `40401`；单位不匹配 `40303`。

#### 4.5.3 创建工单

- 请求：`POST /api/work-orders`
- 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| treeId | string | 是 | 关联树木 |
| issueType | enum | 是 | 问题类型 |
| issueDescription | string | 是 | 问题描述 |
| locationDescription | string | 否 | 相对位置 |
| healthStatus | enum | 是 | 创建时选定的树木健康状态 |
| createPhotos | Photo[] | 是 | 创建照片，最多 4 张 |

- 返回：`data` 为 `WorkOrder完整版`，状态为 `processing`。
- 后端职责：
  - 从 token 自动填充 `creatorId/creatorName/creatorRole`，`creatorName` 为 `User.username`。
  - 从 `Tree.siteId` 快照写入 `WorkOrder.siteId`。
  - 创建人单位必须等于树木 `siteId`，否则 `40303`。
  - 若 `healthStatus` 与当前树木状态不一致，在创建工单事务内更新 `Tree.healthStatus`。
  - 树木不存在 `40401`；缺照片/描述 `40001`。
- 权限：巡检/养护可创建；游客 `40302`。

#### 4.5.4 处置工单

- 请求：`PATCH /api/work-orders/:id/process`
- 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| treatmentMeasures | string | 是 | 处置措施 |
| treatmentPhotos | Photo[] | 是 | 处置照片，最多 4 张 |

- 返回：`data` 为 `WorkOrder完整版`，状态置为 `reviewing`。
- 后端职责：
  - 仅 `maintenance` 可调用，否则 `40302`。
  - 仅 `processing` 状态可处置，否则 `40902`。
  - 工单 `siteId` 必须等于当前用户 `organizationId`，否则 `40303`。
  - 自动填充 `handlerId/handlerName`、`processedAt`、`updatedAt`。
  - 同时将 `Tree.healthStatus` 置为 `warning`。

#### 4.5.5 复核工单

- 请求：`PATCH /api/work-orders/:id/review`
- 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| passed | boolean | 是 | true 通过并归档；false 退回待处置 |
| reviewComment | string | 否 | 复核意见 |
| reviewHealthStatus | enum | 是 | 复核后健康状态 |

- 返回：`data` 为 `WorkOrder完整版`。
- 后端职责：
  - 仅 `inspector` 可调用，否则 `40302`。
  - 仅 `reviewing` 状态可复核，否则 `40902`。
  - 工单 `siteId` 必须等于当前用户 `organizationId`，否则 `40303`。
  - 自动填充 `reviewerId/reviewerName`、`reviewResult`（`passed/rework`）、`reviewedAt`。
  - 通过时状态置 `archived` 并写 `archivedAt`；退回时状态回 `processing`。
  - 同时将 `Tree.healthStatus` 更新为 `reviewHealthStatus`。

#### 4.5.6 导出工单台账

- 请求：`GET /api/work-orders/export`
- 请求参数：复用工单列表筛选参数（`status/siteId/keyword` 等），并应用单位隔离。
- 返回：CSV 文件流，`Content-Type: text/csv;charset=utf-8`，建议带 BOM。
- 列：`工单编号,树木ID,问题类型,状态,创建人,创建时间,处置时间,复核时间,归档时间`。
- 异常：空数据返回仅含表头的 CSV。

### 4.6 游客线索

#### 4.6.1 获取游客线索列表

- 请求：`GET /api/visitor-leads`
- 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| status | enum | 否 | `new/converted` |
| page | number | 否 | 默认 1 |
| pageSize | number | 否 | 默认 20 |

- 返回：`data` 为 `PageResult<VisitorLead全量字段>`（含 `photos`），并返回 `tree: { code, species }` 摘要。
- 异常：游客访问 `40302`；空列表返回 `list: []`。
- 说明：当前未对游客线索做单位隔离；如后续业务需要，可按 `siteId` 追加过滤。

#### 4.6.2 提交游客线索

- 请求：`POST /api/visitor-leads`
- 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| treeId | string | 是 | 关联树木 |
| issueType | enum | 是 | 问题类型 |
| issueDescription | string | 是 | 问题描述 |
| locationDescription | string | 否 | 相对位置 |
| photos | Photo[] | 是 | 现场照片，最多 3 张 |

- 返回：`data` 为 `VisitorLead完整版`，状态 `new`。
- 后端职责：生成 `leadNo`；记录 `submitterId/submitterName`；从 `Tree.siteId` 快照写入 `siteId`；树木不存在 `40401`；缺照片/描述 `40001`。

#### 4.6.3 编辑游客线索

- 请求：`PUT /api/visitor-leads/:id`
- 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| issueType | enum | 是 | 问题类型 |
| issueDescription | string | 是 | 问题描述 |
| locationDescription | string | 否 | 相对位置 |
| healthStatus | enum | 是 | 健康状态 |

- 返回：`data` 为 `VisitorLead完整版`。
- 异常：仅巡检可编辑 `40302`；已转工单禁止编辑 `40903`。

#### 4.6.4 删除游客线索

- 请求：`DELETE /api/visitor-leads/:id`
- 请求参数：路径参数 `id`。
- 返回：`data: null`。
- 异常：仅巡检可删除 `40302`；不存在 `40401`。
- 说明：已转工单的线索允许删除，删除不影响已生成的工单。

#### 4.6.5 游客线索转工单

- 请求：`POST /api/visitor-leads/:id/convert`
- 请求参数：无；线索字段通过 4.6.3 编辑完成。
- 返回：`data` 为 `WorkOrder完整版`，状态 `processing`。
- 后端职责（单事务）：
  - 仅 `inspector` 可转换，否则 `40302`。
  - 线索已转换返回 `40903`，提示“该线索已转为工单”。
  - 创建 `processing` 工单，`sourceLeadId = lead.id`，创建人自动填充当前巡检 `username`，`siteId` 取自树木。
  - 线索置 `converted`，写 `convertedAt/convertedOrderId`。
  - 按线索 `healthStatus` 更新树木健康状态。

### 4.7 导览与打卡

#### 4.7.1 获取打卡记录列表

- 请求：`GET /api/check-ins`
- 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| treeId | string | 否 | 按树木过滤 |
| page | number | 否 | 默认 1 |
| pageSize | number | 否 | 默认 50 |

- 返回：`data` 为 `PageResult<CheckInRecord完整版>`。
- 说明：打卡排行与树种图鉴由前端从本列表数据派生，前端需要全量时可传较大 `pageSize`，后端建议支持不超过 1000。

#### 4.7.2 新增打卡

- 请求：`POST /api/check-ins`
- 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| treeId | string | 是 | 关联树木 |
| photos | Photo[] | 是 | 打卡照片，当前最多 1 张 |

- 返回：`data` 为 `CheckInRecord完整版`，`treeCode/species` 由后端从树木派生快照。
- 异常：树木不存在 `40401`；缺照片 `40001`。

#### 4.7.3 点赞/取消点赞

- 请求：`PATCH /api/check-ins/:id/like`
- 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| liked | boolean | 是 | true 点赞；false 取消点赞 |

- 返回：`data` 为 `CheckInRecord完整版`（或 `{ likeCount, liked }`）。
- 后端职责：`likedBy` 按用户 id 存储；同一用户重复点赞按幂等处理；记录不存在 `40401`。

## 5. 接口清单总表

| 模块 | 接口名称 | 请求方式 | 路径 | 简要说明 |
|---|---|---|---|---|
| 认证与用户 | 用户注册 | POST | `/api/auth/register` | 游客直接 approved；内部角色 pending |
| 认证与用户 | 用户登录 | POST | `/api/auth/login` | 返回 token 与用户信息；pending 禁止登录 |
| 认证与用户 | 获取当前用户 | GET | `/api/auth/me` | 恢复登录态 |
| 认证与用户 | 退出登录 | POST | `/api/auth/logout` | 退出并失效 token |
| 认证与用户 | 获取单位选项 | GET | `/api/organizations` | 注册单位下拉 |
| 树木档案与地图 | 获取树木列表 | GET | `/api/trees` | 返回全量 437 条，前端本地筛选 |
| 树木档案与地图 | 获取树木详情 | GET | `/api/trees/:id` | 树木详情 |
| 树木档案与地图 | 新增树木 | POST | `/api/trees` | 后端生成编号与 siteId 校验 |
| 树木档案与地图 | 更新树木档案 | PATCH | `/api/trees/:id` | 编辑档案/健康状态/照片 |
| 树木档案与地图 | 周边树木查询 | GET | `/api/trees/nearby` | 按经纬度与半径过滤排序 |
| 文件 | 文件上传 | POST | `/api/files` | 统一图片上传，返回 Photo |
| 统计看板 | 获取树木统计概览 | GET | `/api/stats/overview` | 统计卡、图表、生态效益 |
| 工单管理 | 获取工单列表 | GET | `/api/work-orders` | 分页 + 状态统计 + 单位隔离 |
| 工单管理 | 获取工单详情 | GET | `/api/work-orders/:id` | 工单详情 |
| 工单管理 | 创建工单 | POST | `/api/work-orders` | 创建 processing 工单 |
| 工单管理 | 处置工单 | PATCH | `/api/work-orders/:id/process` | 待处置转待复核 |
| 工单管理 | 复核工单 | PATCH | `/api/work-orders/:id/review` | 通过归档或退回待处置 |
| 工单管理 | 导出工单台账 | GET | `/api/work-orders/export` | 导出 CSV |
| 游客线索 | 获取游客线索列表 | GET | `/api/visitor-leads` | 线索表格与状态角标 |
| 游客线索 | 提交游客线索 | POST | `/api/visitor-leads` | 游客提交问题线索 |
| 游客线索 | 编辑游客线索 | PUT | `/api/visitor-leads/:id` | 巡检编辑线索字段 |
| 游客线索 | 删除游客线索 | DELETE | `/api/visitor-leads/:id` | 允许删除已转工单线索 |
| 游客线索 | 线索转工单 | POST | `/api/visitor-leads/:id/convert` | 生成 processing 工单并关联双方 |
| 导览与打卡 | 获取打卡记录列表 | GET | `/api/check-ins` | 照片墙、排行、图鉴数据源 |
| 导览与打卡 | 新增打卡 | POST | `/api/check-ins` | 拍照打卡 |
| 导览与打卡 | 点赞/取消点赞 | PATCH | `/api/check-ins/:id/like` | 照片墙点赞 |

## 6. 后端必须强制的业务规则

1. 单位数据隔离：巡检/养护只能访问 `WorkOrder.siteId` 与本人 `organizationId` 一致的工单；列表越权返回空列表，详情/操作越权返回 `40303`。
2. 工单状态机：创建即 `processing`；处置 `processing -> reviewing`；复核 `reviewing -> archived/processing`；状态冲突返回 `40902`。
3. 事务边界：
   - 创建工单时更新树木健康状态。
   - 处置工单时更新树木健康状态为 `warning`。
   - 复核工单时更新树木健康状态为 `reviewHealthStatus`。
   - 线索转工单时同时创建工单、更新线索状态、更新树木健康状态。
4. 照片规则：业务字段统一 `Photo[]`；`url` 必须是本系统上传接口产生的公开 HTTPS 地址；不得接受 `blob:`、临时 URL 或任意第三方链接。
5. 账号规则：游客注册直接 `approved`；巡检/养护注册默认 `pending`；`pending` 禁止登录。
6. 导出规则：CSV 带 BOM、UTF-8、中文表头；空数据返回仅含表头的 CSV。
7. 分页规则：除树木列表外统一 `page/pageSize/total/list`；树木列表返回全量数组。

## 7. GeoScene Server 树木数据发布字段

树木要素服务由 GeoScene Server 发布，业务 API 与 GeoScene 服务之间建议通过 `code` 关联。要素字段如下：

| 中文 | GeoScene 字段名 | 字段类型 | 说明 |
|---|---|---|---|
| 树木编号 | `code` | TEXT(50) | 业务唯一编号 |
| 树种名称 | `species` | TEXT(50) | 树种 |
| 位置 | `locationDescription` | TEXT(200) | 相对位置描述 |
| 所属园区 | `siteId` | TEXT(50) | `daxingshansi/tangdacien-temple-park` |
| 园区显示名 | `siteName` | TEXT(50) | 由 siteId 派生 |
| 胸径 | `dbh` | DOUBLE | cm |
| 经度 | `longitude` | DOUBLE | WGS84 |
| 纬度 | `latitude` | DOUBLE | WGS84 |
| 类型 | `treeType` | TEXT(20) | `普通树/古树` |
| 保护等级 | `protectionLevel` | TEXT(20) | 古树必填 |
| 健康状态 | `healthStatus` | TEXT(20) | `healthy/warning/problem` |
| 资料卡片 | `story` | TEXT(500) | 资料卡片 |
| 树木照片 | `photos` | TEXT(2000) | `Photo[]` 的 JSON 字符串 |

说明：

- `isAncient` 为派生字段，GeoScene 服务可不发布，由后端/前端根据 `treeType` 计算。
- `photos` 字段内容示例：`[{"uid":"photo-...","name":"现场照片","url":"https://cdn.example.com/trees/DX-1-01.jpg","size":204800,"type":"image/jpeg"}]`。
- 按已确认决策，不增加 `coverPhotoUrl` 字段。
- 要素服务建议开启查询权限；业务 API 与 GeoScene 服务间跨域访问需在服务端配置。

## 8. 前后端职责边界（后端需知）

- 树木列表：后端返回全量 437 条，前端负责关键词、树种、健康状态、胸径、园区的本地筛选。
- 树木健康状态：工单流程内的变更由后端事务完成，前端不调用 `PATCH /api/trees/:id` 同步工单状态。
- 打卡排行与树种图鉴：前端从 `GET /api/check-ins` 全量数据派生，后端不提供专项接口。
- 照片 `uid`：前端生成，后端返回 `name/url/size/type` 即可。
- 角色切换：前端只支持重新登录切换角色，后端无需提供角色切换接口。
- 注册 `username`：前端已补充该表单项，后端注册接口必须要求该字段。
