# 后端接口需求文档

## 文档说明

- 项目：西安城市树木信息服务平台（Vue 3 + JavaScript + ArcGIS JS API）
- 用途：供后端开发人员直接对接，替换当前前端 mock 数据与本地状态
- 依据：`src/` 下页面、组件、路由、状态与 mock 逻辑；按约定排除「路线页」（`RoutesPage.vue`、`RoutesSection.vue`）相关代码
- 文档结构：一、通用约定；二、核心数据模型定义；三、分模块接口详情；四、接口清单总表
- 补充工作流已纳入本文档：
  1. 养护人员、巡检人员注册时单位限定为「大兴善寺」或「唐大慈恩寺遗址公园」；
  2. 树木「位置」为「大兴善寺」的工单只对单位是「大兴善寺」的养护/巡检人员可见，「唐大慈恩寺遗址公园」同理；
  3. 养护/巡检人员注册需填写「用户名」，创建、处置、复核工单时「创建人」「处置人」「复核人」自动填充该用户名。

---

# 一、通用约定

## 1.1 接口前缀与前端接入

- 后端接口统一挂载在 `/api` 前缀下，例如 `POST /api/auth/login`。
- 前端 `package.json` 已安装 `axios`，但目前 `src/` 下没有任何 axios 封装，`src/api/authApi.js` 中只有占位注释：
  - `src/api/authApi.js:54`：`if (API_BASE_URL) { // 后端接口到位后在这里替换为真实 fetch/axios 调用。 }`
  - `src/api/authApi.js:70`：注册处同样占位。
- 前端 `.env` 中预留了 `VITE_API_BASE_URL`（当前为空文件）。后端确定地址后，前端会新增统一 `http` 封装，因此后端只需约定稳定的接口契约，不要求前端现在已封装。

## 1.2 统一请求/响应结构

建议后端统一返回如下包装，HTTP 状态码与业务码同时使用：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

约定：

- `code = 0` 表示业务成功；非 0 表示业务失败。
- 业务失败时，HTTP 状态码建议使用 400/401/403/404/409/500，`message` 返回可直接展示的中文提示。
- 前端现有错误处理只读取 `error.message`（如 `LoginPage.vue` 的 `message.error(error.message || "登录失败")`），因此后端 `message` 必须是可读文案。
- 校验类错误建议携带可选字段 `data`，例如 `{ code: 40001, message: "缺少必填参数", data: { field: "treeId" } }`。

## 1.3 鉴权与角色

- 建议使用 JWT：登录接口返回 `token`，前端在 `Authorization: Bearer <token>` 中携带。
- 角色枚举：`visitor`（游客）、`inspector`（巡检人员）、`maintenance`（养护人员）。
- 权限约定（与现有前端逻辑一致）：
  - 游客：地图、树木详情、导览、打卡、提交游客线索；不可进入工单页（`App.vue` 中 `navOptions` 对 visitor 禁用 workbench，且路由 watch 会强制跳回地图）。
  - 巡检人员：查看游客线索、创建工单、复核工单（`reviewing -> archived/processing`）。
  - 养护人员：创建工单、处置工单（`processing -> reviewing`）。
  - 树木档案编辑（`TreeDetailDrawer.vue` 的 `canEditHealth`）目前对 inspector 和 maintenance 都开放。
- 单位数据隔离（新增工作流）：养护/巡检人员只能看到「树木位置（`siteId`）」与本人 `organizationId` 一致的工单。该规则必须由后端在列表、详情、处置、复核接口强制校验，不能只靠前端隐藏。
- 注册审核：游客注册直接 `approved`；养护/巡检注册默认 `pending`。当前 mock 放行 pending 账号登录（`LoginPage.vue` 提示“当前 mock 环境可继续登录演示”），正式环境是否允许待审核账号登录请产品确认，接口设计上建议默认禁止。
- 角色切换器（`App.vue` 顶栏）目前是纯前端演示功能，真实后端接入后应移除“不重新登录直接切角色”，改为重新登录获取新的 token 与角色。

## 1.4 分页约定

统一分页请求参数与返回结构：

| 参数/字段 | 类型 | 说明 |
|---|---|---|
| `page` | number | 页码，从 1 开始，默认 1 |
| `pageSize` | number | 每页条数，默认 20；前端工单表格当前使用 8 |
| `total` | number | 总条数（返回字段） |
| `list` | array | 当前页数据（返回字段） |

统一返回示例：

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

## 1.5 时间格式

- 统一使用 `YYYY-MM-DD HH:mm:ss`（24 小时制，服务器时区建议为 `Asia/Shanghai`）。
- 现有代码存在两种格式混用，需后端统一输出：
  - `mockApi.js` 初始工单使用 `"2026-07-28 10:00"`；
  - `App.vue`/`GuidePage.vue`/`WorkbenchPanel.vue` 用 `new Date().toLocaleString("zh-CN", { hour12: false })`，实际形如 `2026/8/5 14:30:00`。
- 前端显示不做格式化，后端返回 `YYYY-MM-DD HH:mm:ss` 后直接展示。

## 1.6 坐标与距离

- 字段名统一为 `longitude`、`latitude`（不使用 `lng/lat` 作为接口字段名）。
- 坐标系为 WGS84（ArcGIS 中 `spatialReference: { wkid: 4326 }`）。
- 精度：接口存储与返回保留至少 6 位小数；前端展示用 `.toFixed(6)`。
- 范围：`longitude` 在 `[-180, 180]`，`latitude` 在 `[-90, 90]`。
- 距离字段统一为 `distance`，单位米，保留 1 位小数（现有 `haversineDistance` 返回 `Math.round(distance * 10) / 10`）。

## 1.7 文件上传

- 后端提供独立上传接口 `POST /api/files`（见 3.2.6），前端所有图片选择组件最终都改为“先上传、后提交业务数据”。
- 后端只保存可公开访问的图片 URL（建议对象存储），业务实体字段保存 `Photo` 结构，不保存本地临时对象 URL。
- 前端当前所有上传均为本地 mock：
  - `a-upload :before-upload="() => false"` 使文件不离开浏览器；
  - 多处用 `URL.createObjectURL(file)` 生成本地临时 URL（`MapPage.vue`、`WorkbenchPanel.vue`、`CreateWorkOrderModal.vue`、`TreeDetailDrawer.vue`、`GuidePage.vue`）；
  - `TreeDetailDrawer.vue` 的“补充树木照片”甚至直接插入一张固定 Unsplash 图片。

## 1.8 错误码建议

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

---

# 二、核心数据模型定义

## 2.1 命名冲突与统一结论

| 冲突点 | 代码现状 | 统一结论 |
|---|---|---|
| 树木园区编码 | `trees.json` 中大兴善寺 `siteId = "daxingshansi"`，唐大慈恩寺遗址公园 `siteId = "site"` | 统一为 `daxingshansi`、`tangdacien-temple-park`（与 `mockApi.js` 的 `organizations` 编码一致） |
| 经纬度字段 | 数据模型用 `longitude/latitude`；`GuidePage.vue` 本地变量用 `lat/lng` | 接口一律用 `longitude/latitude` |
| 工单人名字段 | 创建用 `creatorName`；复核用 `reviewUserName`；处置无人名字段 | 统一为 `creatorName/handlerName/reviewerName`，并新增 `creatorId/handlerId/reviewerId` |
| 复核时间字段 | `WorkbenchPanel.vue` 同时写 `reviewTime` 与 `reviewedAt` | 统一为 `reviewedAt` |
| 工单状态 | `statusLabels` 有 `created/processing/reviewing/archived`；README 写了“待派单/处理中” | 以代码为准：`created/processing/reviewing/archived` |
| 树木类型 | `treeType` 与 `isAncient` 同时存在 | `isAncient` 为派生字段（`treeType === "古树"`），建议后端派生或仅存 `treeType` |
| 园区名称 | `siteId/siteName` 同时存储，且 `App.addTree` 用 `siteName = locationDescription` | `siteId` 为业务编码，`siteName` 为展示名，不允许等于相对位置描述 |
| 图片结构 | 树木 `photos` 为 `string[]`；工单/线索 `photos` 为 `{uid,name,url}[]`；打卡为单字段 `photoUrl` | 统一为 `Photo[]`（`photoUrl` 可保留为兼容展示，但模型建议统一） |
| 打卡冗余字段 | `CheckInRecord` 存 `treeId/treeCode/species` | 保留快照或由后端 join 返回，标注为派生/冗余 |
| 用户名 | 注册只有 `account`（登录账号），无“用户名”；工单创建人填的是角色中文名 | `User` 新增 `username`；工单人名自动填 `username` |
| 单位名称 | seed 用户单位是“大兴善寺巡检组”“西安市园林养护一组”，与可选单位不一致 | 单位限定为 `daxingshansi`/`tangdacien-temple-park`，显示名固定为“大兴善寺”“唐大慈恩寺遗址公园” |

## 2.2 实体字段表

字段表列含义：`来源/冗余` 列中，“固有”表示实体自身属性；“派生/冗余”表示可由其他字段计算，不应作为唯一数据源；“新增”表示当前代码缺失、本次需求补充。

### 2.2.1 User（用户）

| 字段名 | 类型 | 必填 | 字段说明 | 示例值 | 来源/冗余 |
|---|---|---|---|---|---|
| id | string | 是 | 用户唯一标识 | `user-10001` | 固有 |
| username | string | 是（新增） | 用户名/姓名，注册时填写；创建/处置/复核工单时自动填入 | `巡检员小王` | 固有（新增） |
| account | string | 是 | 登录账号，同角色下唯一 | `inspector` | 固有 |
| password | string | 是（仅写入） | 密码，任何接口不得返回 | `123456` | 固有（写入） |
| role | enum | 是 | 角色：`visitor/inspector/maintenance` | `inspector` | 固有 |
| organizationId | enum | 内部角色必填 | 单位：`public/daxingshansi/tangdacien-temple-park`；巡检/养护限定为两个公园 | `daxingshansi` | 固有（新增落库） |
| organizationName | string | 是 | 单位显示名 | `大兴善寺` | 派生（由 organizationId 得出） |
| approvalStatus | enum | 是 | `pending/approved` | `pending` | 固有 |
| createdAt | datetime | 是 | 注册时间 | `2026-07-28 10:00:00` | 固有 |
| updatedAt | datetime | 否 | 更新时间 | `2026-07-28 10:00:00` | 固有 |

代码依据：

- `src/api/authApi.js`：seed 用户含 `id/account/password/role/organizationName/approvalStatus`；注册入参含 `organizationId`。
- `src/components/LoginPage.vue`：注册表单有 `account/password/confirmPassword/role/organizationId`，没有 `username`。
- `src/api/mockApi.js`：`organizations` 提供 `public/daxingshansi/tangdacien-temple-park` 三个单位。

### 2.2.2 Tree（树木）

| 字段名 | 类型 | 必填 | 字段说明 | 示例值 | 来源/冗余 |
|---|---|---|---|---|---|
| id | string | 是 | 树木唯一标识（当前与 code 相同） | `DX-1` | 固有 |
| code | string | 是 | 树木业务编号，后端生成 | `DX-438` | 固有 |
| species | string | 是 | 树种名称 | `银杏` | 固有 |
| dbh | number | 是 | 胸径，单位 cm | `24.2` | 固有 |
| longitude | number | 是 | 经度（WGS84） | `108.9385814` | 固有 |
| latitude | number | 是 | 纬度（WGS84） | `34.2276539` | 固有 |
| siteId | enum | 是 | 所属园区：`daxingshansi/tangdacien-temple-park` | `daxingshansi` | 固有 |
| siteName | string | 是 | 园区显示名 | `大兴善寺` | 派生/冗余（由 siteId 得出） |
| treeType | enum | 是 | `普通树/古树` | `普通树` | 固有 |
| isAncient | boolean | 是 | 是否古树 | `false` | 派生（`treeType === "古树"`） |
| protectionLevel | enum/null | 古树必填 | `一级保护/二级保护/三级保护` | `二级保护` | 固有 |
| healthStatus | enum | 是 | `healthy/warning/problem` | `warning` | 固有 |
| locationDescription | string | 否 | 相对位置描述 | `山门东侧第三排` | 固有 |
| photos | Photo[] | 否 | 树木照片（当前为 string[]，需统一） | `[{uid,name,url}]` | 固有 |
| story | string | 否 | 资料卡片 | `常绿乔木，姿态挺拔……` | 固有 |
| remark | string | 否 | 备注 | `` | 固有 |
| createdAt | datetime | 否 | 建档时间 | `2026-07-28 10:00:00` | 固有 |
| updatedAt | datetime | 否 | 更新时间 | `2026-07-28 10:00:00` | 固有 |
| distance | number | 否 | 与查询点的距离，单位米 | `12.3` | 派生，不落库，仅 nearby 接口返回 |

数据现状（来自 `src/data/trees.json`）：

- 共 437 棵；大兴善寺 332 棵（`siteId = "daxingshansi"`），唐大慈恩寺遗址公园 105 棵（`siteId = "site"`，需迁移）。
- 古树 8 棵，全部 `protectionLevel = "二级保护"`。
- 437 棵全部有坐标、胸径、照片，照片均为单元素字符串数组。
- `id` 与 `code` 完全一致，前缀 `DX`/`DC`。

### 2.2.3 WorkOrder（工单）

| 字段名 | 类型 | 必填 | 字段说明 | 示例值 | 来源/冗余 |
|---|---|---|---|---|---|
| id | string | 是 | 工单唯一标识 | `wo-1` | 固有 |
| orderNo | string | 是 | 工单编号，后端生成 | `WO-20260728-001` | 固有 |
| treeId | string | 是 | 关联树木 id | `DX-1` | 关联（FK -> Tree.id） |
| siteId | enum | 是（新增） | 树木位置快照，创建工单时取自 Tree.siteId；用于单位隔离 | `daxingshansi` | 冗余快照（建议落库，保证历史工单隔离稳定） |
| status | enum | 是 | `created/processing/reviewing/archived` | `processing` | 固有 |
| issueType | enum | 是 | 问题类型 | `病虫害` | 固有 |
| issueDescription | string | 是 | 问题描述 | `发现蚜虫，需要养护确认` | 固有 |
| locationDescription | string | 否 | 相对位置 | `碑亭北侧` | 固有 |
| creatorId | string | 是（新增） | 创建人用户 id，后端从 token 填充 | `user-10001` | 固有（新增） |
| creatorName | string | 是（语义调整） | 创建人用户名，自动填充 `User.username` | `巡检员小王` | 固有（快照） |
| creatorRole | enum | 是 | 创建时角色快照 | `inspector` | 冗余快照 |
| handlerId | string | 否（新增） | 处置人用户 id，处置时自动填充 | `user-10002` | 固有（新增） |
| handlerName | string | 否（新增） | 处置人用户名 | `养护老李` | 固有（新增，快照） |
| reviewerId | string | 否（新增） | 复核人用户 id | `user-10001` | 固有（新增） |
| reviewerName | string | 否（统一） | 复核人用户名（替代现 `reviewUserName`） | `巡检员小王` | 固有（快照） |
| reviewResult | enum/null | 否 | `passed/rework` | `passed` | 固有 |
| reviewHealthStatus | enum/null | 否 | 复核后健康状态 | `warning` | 固有 |
| reviewComment | string | 否 | 复核意见 | `处置效果达标，归档。` | 固有 |
| createPhotos | Photo[] | 是 | 创建照片（前端表单必填，最多 4 张） | `[{uid,name,url}]` | 固有 |
| treatmentMeasures | string | 否 | 处置措施 | `已完成现场清理并设置继续观察标记。` | 固有 |
| treatmentPhotos | Photo[] | 否 | 处置照片（提交处置时必填，最多 4 张） | `[{uid,name,url}]` | 固有 |
| sourceLeadId | string | 否 | 来源游客线索 id | `lead-1` | 关联（FK -> VisitorLead.id） |
| createdAt | datetime | 是 | 创建时间 | `2026-07-28 10:00:00` | 固有 |
| processedAt | datetime | 否 | 处置时间 | `2026-07-28 15:30:00` | 固有 |
| reviewedAt | datetime | 否 | 复核时间 | `2026-07-28 16:30:00` | 固有 |
| archivedAt | datetime | 否 | 归档时间 | `2026-07-28 16:30:00` | 固有 |
| updatedAt | datetime | 否 | 最后更新时间 | `2026-07-28 16:30:00` | 固有 |

代码依据：

- 创建处（`CreateWorkOrderModal.vue`、`WorkbenchPanel.vue`、`App.vue`）均手工拼 `id/orderNo/status/issueType/issueDescription/locationDescription/creatorRole/creatorName/createPhotos/createdAt/updatedAt`。
- 处置处（`WorkbenchPanel.vue`、`GuidePage.vue`）写入 `status/treatmentMeasures/treatmentPhotos/processedAt/updatedAt`。
- 复核处写入 `status/reviewResult/reviewComment/reviewHealthStatus/reviewedAt/archivedAt/updatedAt`，其中 `WorkbenchPanel.vue` 还多写了 `reviewTime` 与硬编码 `reviewUserName: "巡检人员"`。

列表接口使用 WorkOrder 精简版，裁剪字段：`issueDescription`、`locationDescription`、`createPhotos`、`treatmentMeasures`、`treatmentPhotos`、`reviewComment`、`reviewResult`、`reviewHealthStatus`、`sourceLeadId`。详情接口使用完整版。

### 2.2.4 VisitorLead（游客线索）

| 字段名 | 类型 | 必填 | 字段说明 | 示例值 | 来源/冗余 |
|---|---|---|---|---|---|
| id | string | 是 | 线索唯一标识 | `lead-1` | 固有 |
| leadNo | string | 是 | 线索编号，后端生成 | `LEAD-20260728-001` | 固有 |
| treeId | string | 是 | 关联树木 id | `DX-1` | 关联（FK -> Tree.id） |
| siteId | enum | 否（建议新增） | 树木位置快照 | `daxingshansi` | 冗余快照（建议新增） |
| status | enum | 是 | `new/converted` | `new` | 固有 |
| issueType | enum | 是 | 问题类型 | `病虫害` | 固有 |
| issueDescription | string | 是 | 问题描述 | `游客反馈附近存在异常现象` | 固有 |
| locationDescription | string | 否 | 相对位置 | `山门东侧` | 固有 |
| healthStatus | enum | 否 | 巡检人员编辑线索时可补充的健康状态（当前仅存在于转工单流程） | `problem` | 固有（建议落库） |
| photos | Photo[] | 是 | 现场照片（游客提交时必填，最多 3 张） | `[{uid,name,url}]` | 固有 |
| submitterId | string | 否（建议新增） | 提交人用户 id（当前代码未记录） | `user-10003` | 固有（建议新增） |
| submitterName | string | 否（建议新增） | 提交人用户名 | `游客` | 固有（建议新增） |
| createdAt | datetime | 是 | 提交时间 | `2026-07-28 11:20:00` | 固有 |
| convertedAt | datetime | 否 | 转工单时间 | `2026-07-28 12:00:00` | 固有 |
| convertedOrderId | string | 否 | 转换后的工单 id | `wo-9` | 关联（FK -> WorkOrder.id） |
| updatedAt | datetime | 否 | 更新时间 | `2026-07-28 12:00:00` | 固有 |

代码依据：

- `mockApi.js` 的 `createInitialVisitorLeads` 不含 `healthStatus`；
- `WorkbenchPanel.vue` 的线索抽屉可编辑 `issueType/issueDescription/locationDescription/healthStatus` 后转工单。

### 2.2.5 CheckInRecord（打卡记录）

| 字段名 | 类型 | 必填 | 字段说明 | 示例值 | 来源/冗余 |
|---|---|---|---|---|---|
| id | string | 是 | 打卡记录唯一标识 | `ci-demo-1` | 固有 |
| treeId | string | 是 | 关联树木 id | `DX-1` | 关联（FK -> Tree.id） |
| treeCode | string | 是 | 树木编号快照 | `DX-1` | 派生/冗余 |
| species | string | 是 | 树种快照，用于照片墙与图鉴解锁 | `松树` | 派生/冗余 |
| photoUrl | string | 是 | 打卡照片 URL（建议统一为 `photos: Photo[]`） | `https://...` | 固有（结构待统一） |
| userName | string | 是 | 打卡人用户名 | `游客` | 固有（快照） |
| likedBy | string[] | 是 | 点赞人 id 列表（当前代码为用户名数组） | `["user-10001"]` | 固有（建议改为 id） |
| likeCount | number | 是（派生） | 点赞数 | `1` | 派生（`likedBy.length`） |
| createdAt | datetime | 是 | 打卡时间 | `2026-08-05 14:30:00` | 固有 |

代码依据：

- `App.vue` 中初始 `checkInRecords` 与 `addCheckIn/toggleLike`；
- `GuidePage.vue` 照片墙、排行、图鉴解锁均基于该数组 computed 得出。

### 2.2.6 Photo（附件）

| 字段名 | 类型 | 必填 | 字段说明 | 示例值 |
|---|---|---|---|---|
| uid | string | 前端必填 | 前端组件 key（上传接口可返回或前端生成） | `photo-1723000000000-123` |
| name | string | 是 | 文件名/展示名 | `现场照片` |
| url | string | 是 | 可访问的图片地址 | `https://cdn.example.com/xxx.jpg` |
| size | number | 否 | 文件大小（字节） | `204800` |
| type | string | 否 | MIME 类型 | `image/jpeg` |

### 2.2.7 Organization/Site（单位/园区）

| 字段名 | 类型 | 必填 | 字段说明 | 示例值 |
|---|---|---|---|---|
| id | enum | 是 | `public/daxingshansi/tangdacien-temple-park` | `daxingshansi` |
| name | string | 是 | `公众访问/大兴善寺/唐大慈恩寺遗址公园` | `大兴善寺` |

代码依据：`src/api/mockApi.js` 的 `organizations` 数组。

### 2.2.8 Stats（统计结果，派生数据，不落库）

| 字段名 | 类型 | 说明 | 对应前端 |
|---|---|---|---|
| totalTrees | number | 树木总数 | `buildStats().totalTrees`、地图页“树木入图” |
| speciesCount | number | 树种数量 | 地图页“树种数量” |
| speciesRatio | array | `[{species,count,percentage}]`，按数量降序 | `StatsPanel` 饼图 |
| dbhDistribution | array | `[{range,count}]`，区间 `0-15/15-30/30-50/50-80/80+` | `StatsPanel` 柱状图 |
| siteComparison | array | `[{siteId,siteName,species,count}]` | `buildStats` 输出 |
| ecologicalBenefits | object | `carbonStorage/carbonSequestration/oxygenProduction/stormwaterIntercepted/airPollutionRemoved` | 地图页生态效益卡片 |
| ancientCount | number | 古树数量 | 地图页“古树名木” |
| workOrderCount | number | 工单数量 | 地图页“养护记录” |

## 2.3 实体关联关系

| 关系 | 说明 |
|---|---|
| Tree 1:N WorkOrder | 一棵树可有多个历史工单；工单通过 `treeId` 关联 |
| Tree 1:N VisitorLead | 一棵树可有多个游客线索 |
| Tree 1:N CheckInRecord | 一棵树可有多次打卡 |
| User 1:N WorkOrder | 同一用户可创建/处置/复核多个工单（通过 `creatorId/handlerId/reviewerId`） |
| User 1:N CheckInRecord | 打卡记录记录提交人 |
| VisitorLead 1:1 WorkOrder | 线索转工单后通过 `sourceLeadId`/`convertedOrderId` 互相关联 |
| Organization 1:N Tree | 单位/园区包含多棵树（`siteId`） |
| Organization 1:N User | 巡检/养护人员归属一个单位，用于工单可见性隔离 |

## 2.4 枚举统一定义

| 枚举 | 内部值 | 中文含义 | 代码依据 |
|---|---|---|---|
| role | `visitor` | 游客 | `mockApi.js roleLabels` |
| role | `inspector` | 巡检人员 | `mockApi.js roleLabels` |
| role | `maintenance` | 养护人员 | `mockApi.js roleLabels` |
| organizationId | `public` | 公众访问 | `mockApi.js organizations` |
| organizationId | `daxingshansi` | 大兴善寺 | `mockApi.js organizations` |
| organizationId | `tangdacien-temple-park` | 唐大慈恩寺遗址公园 | `mockApi.js organizations` |
| approvalStatus | `pending` | 待审核 | `authApi.js` |
| approvalStatus | `approved` | 已通过 | `authApi.js` |
| treeType | `普通树` | 普通树 | `trees.json` |
| treeType | `古树` | 古树 | `trees.json` |
| protectionLevel | `一级保护` | 一级保护 | `MapPage.vue` |
| protectionLevel | `二级保护` | 二级保护 | `trees.json`（8 棵古树均为此值） |
| protectionLevel | `三级保护` | 三级保护 | `MapPage.vue` |
| healthStatus | `healthy` | 正常 | `mockApi.js healthOptions` |
| healthStatus | `warning` | 待观察 | `mockApi.js healthOptions` |
| healthStatus | `problem` | 异常 | `mockApi.js healthOptions` |
| workOrderStatus | `created` | 已创建（代码有枚举但无创建入口） | `mockApi.js statusLabels` |
| workOrderStatus | `processing` | 待处置 | `mockApi.js statusLabels` |
| workOrderStatus | `reviewing` | 待复核 | `mockApi.js statusLabels` |
| workOrderStatus | `archived` | 已归档（用户描述中的“已完成”对应此值） | `mockApi.js statusLabels` |
| leadStatus | `new` | 新线索 | `mockApi.js leadStatusLabels` |
| leadStatus | `converted` | 已转工单 | `mockApi.js leadStatusLabels` |
| reviewResult | `passed` | 通过并归档 | `WorkbenchPanel.vue` |
| reviewResult | `rework` | 退回待处置 | `WorkbenchPanel.vue` |
| issueType | `病虫害/倾斜/枯枝/根系隆起/树皮损伤/长势异常` | 问题类型 | `mockApi.js issueTypes` |

## 2.5 状态流转与接口驱动

```text
创建工单（巡检/养护）          -> processing        （POST /api/work-orders）
processing --养护提交处置-->   -> reviewing          （PATCH /api/work-orders/:id/process；树木 healthStatus 自动置为 warning）
reviewing --巡检复核通过-->    -> archived           （PATCH /api/work-orders/:id/review；树木 healthStatus 更新为复核值）
reviewing --巡检复核退回-->    -> processing         （同上，reviewResult = rework）
游客线索 new --巡检转工单-->   -> converted          （POST /api/visitor-leads/:id/convert；同时生成 processing 工单）
```

说明：

- 每个状态流转节点都需要后端接口驱动，前端不再直接改写状态。
- 树木健康状态在“创建工单、提交处置、复核”中由前端手动 `updateTree` 更新（`CreateWorkOrderModal.vue`、`WorkbenchPanel.vue`、`GuidePage.vue` 均有此逻辑）。接入后端后应改为由后端在工单接口内原子更新，避免前后端状态不一致。
- 同一工单并发处置/复核属于状态冲突场景，后端需要做乐观锁或事务控制（错误码 `40902`）。

---

# 三、分模块接口详情

## 3.1 认证与用户模块

### 3.1.1 用户登录

1. 接口名称：用户登录
2. 调用场景：`src/components/LoginPage.vue` 登录 Tab 点击“登录”，对应 `src/api/authApi.js` 的 `login()`
3. 请求方式与路径：`POST /api/auth/login`
4. 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| account | string | 是 | 登录账号 |
| password | string | 是 | 密码 |
| role | enum | 是 | 登录角色：`visitor/inspector/maintenance` |

5. 返回数据结构：`data` 为 `{ token: string, user: User精简版 }`；User 精简版返回 `id/username/account/role/organizationId/organizationName/approvalStatus`，不返回 `password`。
6. 异常/边界：
   - 账号、密码或角色不匹配：`40102`，提示“账号、密码或角色不匹配”（与当前 `authApi.js` 文案一致）。
   - 账号待审核：`40301`（正式环境建议禁止登录）。
7. 与前端 mock 逻辑的对应关系：`src/api/authApi.js` 的 `login()`、`seedUsers`、`localStorage[CURRENT_USER_KEY]`。

### 3.1.2 用户注册

1. 接口名称：用户注册
2. 调用场景：`LoginPage.vue` 注册 Tab 点击“提交注册”，对应 `authApi.js` 的 `register()`
3. 请求方式与路径：`POST /api/auth/register`
4. 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| account | string | 是 | 登录账号 |
| username | string | 是（新增） | 用户名，注册必填；用于工单创建人/处置人/复核人自动填充 |
| password | string | 是 | 密码 |
| role | enum | 是 | `visitor/inspector/maintenance` |
| organizationId | enum | 巡检/养护必填 | 仅允许 `daxingshansi` 或 `tangdacien-temple-park` |

5. 返回数据结构：`data` 为 `User精简版`（含 `approvalStatus`）。游客直接 `approved`；巡检/养护返回 `pending`。
6. 异常/边界：
   - 账号在当前角色下已存在：`40901`，提示“该账号在当前角色下已存在”（与当前 `authApi.js` 文案一致）。
   - 巡检/养护未选择单位或选择了 `public`：`40003`，提示“养护人员和巡检人员注册时必须选择工作单位”。
   - 缺少 `username`：`40001`。
7. 与前端 mock 逻辑的对应关系：`authApi.js` 的 `register()`、`organizations`、`localStorage[STORAGE_KEY]`；`LoginPage.vue` 目前只校验 `organizationId` 非空，需新增 `username` 表单项。

### 3.1.3 获取当前用户

1. 接口名称：获取当前用户信息
2. 调用场景：应用启动恢复登录态；对应 `authApi.js` 的 `getCurrentUser()`（当前从 localStorage 读取）
3. 请求方式与路径：`GET /api/auth/me`
4. 请求参数：无（token 从 header 获取）
5. 返回数据结构：`data` 为 `User精简版`。
6. 异常/边界：token 失效返回 `40101`；前端应清除本地登录态并回到登录页。
7. 与前端 mock 逻辑的对应关系：`authApi.js` 的 `getCurrentUser()` + `localStorage[CURRENT_USER_KEY]`。

### 3.1.4 退出登录

1. 接口名称：退出登录
2. 调用场景：`App.vue` 顶栏“退出”，对应 `authApi.js` 的 `logout()`
3. 请求方式与路径：`POST /api/auth/logout`
4. 请求参数：无
5. 返回数据结构：`data: null`。
6. 异常/边界：token 已失效时仍应返回成功，前端照常清空本地状态。
7. 与前端 mock 逻辑的对应关系：`authApi.js` 的 `logout()`（仅删除 localStorage）。

### 3.1.5 获取单位选项

1. 接口名称：获取可选单位列表
2. 调用场景：`LoginPage.vue` 注册表单“工作单位”下拉，当前来自 `mockApi.js` 的 `organizations`
3. 请求方式与路径：`GET /api/organizations`
4. 请求参数：无
5. 返回数据结构：`data` 为 `Organization[]`（建议只返回 `daxingshansi`、`tangdacien-temple-park`，`public` 不进入注册下拉）。
6. 异常/边界：接口失败时可回退前端静态枚举，但以后端返回为准。
7. 与前端 mock 逻辑的对应关系：`mockApi.js` 的 `organizations`。

## 3.2 树木档案与地图模块

### 3.2.1 获取树木列表

1. 接口名称：获取树木列表
2. 调用场景：
   - `App.vue` 初始化 `trees`（当前直接 `import trees from "./data/trees.json"`）；
   - `MapPage.vue` 地图点位、搜索框 `treeSearchOptions`、`FilterPanel` 筛选；
   - `WorkbenchPanel.vue`/`CreateWorkOrderModal.vue` 创建工单时选择树木。
3. 请求方式与路径：`GET /api/trees`
4. 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| keyword | string | 否 | 树号/树种/位置模糊搜索（搜索框当前为前端 filter，建议后端支持） |
| species | string[] | 否 | 树种筛选（多选） |
| healthStatus | enum | 否 | `healthy/warning/problem` |
| dbhMin | number | 否 | 最小胸径 |
| dbhMax | number | 否 | 最大胸径 |
| siteId | enum | 否 | 园区筛选 |
| page | number | 否 | 默认 1 |
| pageSize | number | 否 | 默认 20 |

5. 返回数据结构：`data` 为 `PageResult<Tree精简版>`。Tree 精简版裁剪 `story/remark`（地图点位需要 `id/code/species/dbh/longitude/latitude/siteId/siteName/treeType/isAncient/protectionLevel/healthStatus/locationDescription/photos`）。
   - 若前端继续保留本地筛选交互（`FilterPanel`），也可一次性返回全量 437 条；但建议后端支持上述筛选参数，为大数据量留余地。
6. 异常/边界：无数据时返回 `list: []`、`total: 0`，HTTP 200；坐标缺失的树木不得出现在地图点位。
7. 与前端 mock 逻辑的对应关系：`src/data/trees.json`、`App.vue` 的 `trees`、`filteredTrees`、`treeSearchOptions`、`FilterPanel` 的本地 computed。

### 3.2.2 获取树木详情

1. 接口名称：获取树木详情
2. 调用场景：`TreeDetailDrawer.vue` 树木详情抽屉；`GuidePage.vue` 树木详情核验；`WorkbenchPanel.vue` 工单关联树木信息（也可由工单接口连带返回）
3. 请求方式与路径：`GET /api/trees/:id`
4. 请求参数：路径参数 `id`
5. 返回数据结构：`data` 为 `Tree完整版`（含 `story/remark/photos`）。
6. 异常/边界：不存在返回 `40401`。
7. 与前端 mock 逻辑的对应关系：`App.vue` 的 `trees`/`selectedTree`；`mockApi.js` 的 `findTree()`（当前未被调用）。

### 3.2.3 新增树木

1. 接口名称：新增树木
2. 调用场景：`MapPage.vue` 左侧“添加树木”抽屉，点击“添加”，对应 `App.vue` 的 `addTree()`
3. 请求方式与路径：`POST /api/trees`
4. 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| species | string | 是 | 树种名称 |
| dbh | number | 否 | 胸径 cm |
| longitude | number | 是 | 经度 |
| latitude | number | 是 | 纬度 |
| siteId | enum | 是（新增） | 必须为 `daxingshansi/tangdacien-temple-park`；建议默认取当前用户 organizationId |
| locationDescription | string | 否 | 相对位置，不能作为 siteName |
| treeType | enum | 是 | `普通树/古树` |
| protectionLevel | enum | 古树必填 | `一级保护/二级保护/三级保护` |
| healthStatus | enum | 是 | `healthy/warning/problem`（当前抽屉选项缺 `warning`，建议补齐） |
| story | string | 否 | 资料卡片 |
| photos | Photo[] | 否 | 已上传照片 |

5. 返回数据结构：`data` 为 `Tree完整版`（后端生成 `code`，建议格式 `<园区前缀>-<序号>`，如 `DX-438`）。
6. 异常/边界：
   - 缺少坐标或坐标越界：`40002`，前端已有“请输入坐标”校验。
   - 古树未填保护等级：`40002`。
   - `siteId` 缺失：`40001`。
   - 当前代码问题：`App.vue` 的 `addTree()` 将 `siteId` 硬编码为 `"site"`、`siteName` 设为 `locationDescription`，与新单位隔离规则冲突，前端需改为传 `siteId`。
7. 与前端 mock 逻辑的对应关系：`App.vue` 的 `addTree()`、`computeNextTreeCode()`；`MapPage.vue` 的 `handleAddTree()`。

### 3.2.4 更新树木档案

1. 接口名称：更新树木档案
2. 调用场景：
   - `TreeDetailDrawer.vue` 的 `saveArchive()`（树种/胸径/资料卡片）；
   - `TreeDetailDrawer.vue` 的 `updateHealth()`（健康状态）；
   - `TreeDetailDrawer.vue` 的 `addTreePhoto()`（补充照片，当前使用假 URL，需改为上传后调用本接口）；
   - 工单流程中的健康状态变更（建议改由工单接口后端原子完成，见 2.5）。
3. 请求方式与路径：`PATCH /api/trees/:id`
4. 请求参数（部分更新）：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| species | string | 否 | 树种 |
| dbh | number | 否 | 胸径 |
| story | string | 否 | 资料卡片 |
| healthStatus | enum | 否 | 健康状态 |
| photos | Photo[] | 否 | 完整照片数组（追加/删除由前端组装后提交） |

5. 返回数据结构：`data` 为 `Tree完整版`。
6. 异常/边界：树木不存在返回 `40401`；`healthStatus` 非法返回 `40002`。
7. 与前端 mock 逻辑的对应关系：`App.vue` 的 `updateTree()`，由抽屉/工单组件 emit `updateTree` 触发。

### 3.2.5 周边树木查询

1. 接口名称：周边树木查询（按坐标距离过滤排序）
2. 调用场景：
   - `GuidePage.vue` 巡检/养护“选择定位”模式：点击地图、输入坐标或调整半径后调用 `fetchNearbyTreesMock()`；
   - `GuideSection.vue` 游客“定位附近树木”：浏览器定位后调用 `findNearbyTrees()`（固定 10 米）。
3. 请求方式与路径：`GET /api/trees/nearby`
4. 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| latitude | number | 是 | 查询点纬度 |
| longitude | number | 是 | 查询点经度 |
| radius | number | 是 | 半径，单位米；前端选项 5/10/20/50，游客固定 10 |
| page | number | 否 | 默认 1 |
| pageSize | number | 否 | 默认 20 |

5. 返回数据结构：`data` 为 `PageResult<Tree精简版 + distance>`，按 `distance` 升序。`distance` 为后端动态计算字段，不落库。
6. 异常/边界：
   - 坐标缺失/越界、radius 非正数：`40002`。
   - 该范围内无树：返回 `list: []`，前端展示“该范围内未找到树木，请调整位置或半径”。
   - 前端保留当前 mock 中的 Haversine 公式逻辑位置：建议移除 `mockApi.js` 的 `haversineDistance/findNearbyTrees/fetchNearbyTreesMock`，由后端统一计算，避免前端数据分页后本地过滤失效。
7. 与前端 mock 逻辑的对应关系：`mockApi.js` 的 `fetchNearbyTreesMock()`、`findNearbyTrees()`、`haversineDistance()`。

### 3.2.6 文件上传

1. 接口名称：文件上传
2. 调用场景（横切模块，被下列交互复用）：
   - `MapPage.vue` 添加树木照片；
   - `TreeDetailDrawer.vue` 补充树木照片、游客线索现场照片；
   - `CreateWorkOrderModal.vue` 创建工单照片；
   - `WorkbenchPanel.vue` 创建工单照片、处置照片；
   - `GuidePage.vue` 处置照片、游客拍照打卡。
3. 请求方式与路径：`POST /api/files`
4. 请求参数：`multipart/form-data`，字段 `file`（图片文件），可选字段 `bizType`（如 `tree/order/lead/checkin`）。
5. 返回数据结构：`data` 为 `Photo`（至少 `{ name, url }`，建议含 `id`；`uid` 由前端生成）。
6. 异常/边界：
   - 非图片类型：`40002`（建议限制 `image/*`）；
   - 文件过大：`413`，返回可展示提示。
7. 与前端 mock 逻辑的对应关系：
   - 各组件 `a-upload` 的 `:before-upload="() => false"`；
   - `toPhotoRecords()` 用 `URL.createObjectURL()` 生成本地 URL；
   - `TreeDetailDrawer.vue` 的 `addTreePhoto()` 使用固定 Unsplash URL；
   - `GuidePage.vue` 的 `onCameraCapture()` 直接 `URL.createObjectURL(file)` 写入打卡记录。

## 3.3 统计看板模块

### 3.3.1 获取树木统计概览

1. 接口名称：获取树木统计概览
2. 调用场景：
   - `MapPage.vue` 首页统计卡片（树木入图、养护记录、古树名木、树种数量）；
   - `MapPage.vue` 统计弹窗中的 `StatsPanel.vue`（树种构成、胸径分布、生态效益）；
   - `LoginPage.vue` 硬编码的“437 采集树木”（建议替换为本接口返回值）。
3. 请求方式与路径：`GET /api/stats/overview`
4. 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| siteId | enum | 否 | 按园区过滤，缺省为全部 |

5. 返回数据结构：`data` 为 `Stats`（见 2.2.8），其中 `workOrderCount` 建议按当前用户单位隔离规则统计（游客显示全部或按产品要求处理）。
6. 异常/边界：树木列表为空时各计数为 0，`percentage` 为 0，不允许除零报错。
7. 与前端 mock 逻辑的对应关系：`mockApi.js` 的 `buildStats()`、`MapPage.vue` 的 `workOrders.length` 与 `trees.filter(isAncient).length`、`App.vue` 的 `stats` computed。

## 3.4 工单管理模块

### 3.4.1 获取工单列表

1. 接口名称：获取工单列表
2. 调用场景：
   - `WorkbenchPanel.vue` 正式工单 Tab（表格 + 状态筛选 + 状态统计卡）；
   - `MapPage.vue` 最近 3 条“树木养护活动”；
   - `GuidePage.vue` 导航模式 `loadPendingOrders()`（当前用 `getPendingOrdersForRole()` 本地过滤）。
3. 请求方式与路径：`GET /api/work-orders`
4. 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| status | enum | 否 | `created/processing/reviewing/archived` |
| keyword | string | 否 | 工单号/树木编号模糊搜索 |
| treeId | string | 否 | 按树木过滤 |
| mine | boolean | 否 | 只看当前用户待处理/待复核（对应 `pendingOrdersForRole`） |
| siteId | enum | 否 | 按园区过滤；后端必须强制叠加当前用户单位范围 |
| page | number | 否 | 默认 1 |
| pageSize | number | 否 | 默认 20 |

5. 返回数据结构：`data` 为 `PageResult<WorkOrder精简版>`，并建议附带 `stats: { created, processing, reviewing, archived }`（对应 `WorkbenchPanel.vue` 的 `orderStats`）。精简版同时返回 `tree: { code, species, healthStatus }` 摘要，供列表直接展示。
6. 异常/边界：
   - 游客访问：`40302`（前端已禁用入口，后端仍需校验）。
   - 单位隔离：巡检/养护只能看到 `WorkOrder.siteId == 当前用户.organizationId` 的工单；越权返回空列表或 `40303`。
   - 空列表：返回 `list: []`、`total: 0`、stats 全 0。
7. 与前端 mock 逻辑的对应关系：`mockApi.js` 的 `createInitialWorkOrders()`、`getPendingOrdersForRole()`；`App.vue` 的 `workOrders/recentWorkOrders/pendingOrdersForRole`。

### 3.4.2 获取工单详情

1. 接口名称：获取工单详情
2. 调用场景：
   - `WorkbenchPanel.vue` 工单详情抽屉；
   - `GuidePage.vue` 导航模式的工单详情抽屉（`openOrderDetail`）。
3. 请求方式与路径：`GET /api/work-orders/:id`
4. 请求参数：路径参数 `id`
5. 返回数据结构：`data` 为 `WorkOrder完整版`，并返回 `tree: { code, species, dbh, healthStatus }` 摘要。
6. 异常/边界：不存在返回 `40401`；单位不匹配返回 `40303`。
7. 与前端 mock 逻辑的对应关系：`App.vue` 的 `selectedOrder`、`WorkbenchPanel.vue` 的 `getTreeForOrder`、`GuidePage.vue` 的 `detailOrder`。

### 3.4.3 创建工单

1. 接口名称：创建正式工单
2. 调用场景：
   - `CreateWorkOrderModal.vue` 点击“提交工单”；
   - `WorkbenchPanel.vue` 创建正式工单表单；
   - `GuidePage.vue` 选定树木后点击“选定此树，创建工单”。
3. 请求方式与路径：`POST /api/work-orders`
4. 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| treeId | string | 是 | 关联树木 |
| issueType | enum | 是 | 问题类型 |
| issueDescription | string | 是 | 问题描述 |
| locationDescription | string | 否 | 相对位置 |
| healthStatus | enum | 是 | 创建时选定的树木健康状态（当前表单必填） |
| createPhotos | Photo[] | 是 | 创建照片（当前前端必填，最多 4 张） |

5. 返回数据结构：`data` 为 `WorkOrder完整版`。
6. 异常/边界与后端职责：
   - 后端从 token 自动填充 `creatorId/creatorName/creatorRole`，其中 `creatorName` 为 `User.username`（新规则），不再由前端传角色中文名。
   - 后端从 `Tree.siteId` 快照写入 `WorkOrder.siteId`。
   - 建议校验：创建人单位必须等于树木 `siteId`，否则 `40303`。
   - 若 `healthStatus` 与当前树木状态不一致，后端在创建工单事务内更新 `Tree.healthStatus`。
   - 树木不存在：`40401`；缺照片/描述：`40001`。
7. 与前端 mock 逻辑的对应关系：`CreateWorkOrderModal.vue` 的 `handleSubmit()`、`WorkbenchPanel.vue` 的 `createOrder()`、`App.vue` 的 `createWorkOrder()`；当前前端同时 `emit("updateTree")` 更新健康状态，接入后端后删除该前端更新。

### 3.4.4 处置工单

1. 接口名称：提交工单处置（待处置 -> 待复核）
2. 调用场景：
   - `WorkbenchPanel.vue` 工单详情抽屉的“处置反馈”表单；
   - `GuidePage.vue` 导航模式工单详情抽屉的“提交复核”。
3. 请求方式与路径：`PATCH /api/work-orders/:id/process`
4. 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| treatmentMeasures | string | 是 | 处置措施 |
| treatmentPhotos | Photo[] | 是 | 处置照片（前端必填，最多 4 张） |

5. 返回数据结构：`data` 为 `WorkOrder完整版`。
6. 异常/边界与后端职责：
   - 仅 `maintenance` 角色可调：`40302`。
   - 仅 `processing` 状态可处置，否则 `40902`（防止同一工单被两人同时处置）。
   - 单位隔离：工单 `siteId` 必须等于当前用户 `organizationId`，否则 `40303`。
   - 后端自动填充 `handlerId/handlerName`（`User.username`）、`processedAt`、`updatedAt`，状态置为 `reviewing`。
   - 按当前前端行为，后端同时将 `Tree.healthStatus` 置为 `warning`。
7. 与前端 mock 逻辑的对应关系：`WorkbenchPanel.vue` 的 `submitTreatment()`、`GuidePage.vue` 的 `submitTreatmentInGuide()`；当前前端手工 `emit("updateOrder", ...)` 并 `emit("updateTree", {healthStatus:"warning"})`。

### 3.4.5 复核工单

1. 接口名称：复核工单（通过归档/退回待处置）
2. 调用场景：
   - `WorkbenchPanel.vue` 工单详情抽屉的“通过并归档/退回待处置”；
   - `GuidePage.vue` 导航模式工单详情抽屉的“通过并归档/退回待处置”。
3. 请求方式与路径：`PATCH /api/work-orders/:id/review`
4. 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| passed | boolean | 是 | true 通过并归档；false 退回待处置 |
| reviewComment | string | 否 | 复核意见；为空时前端默认文案“处置效果达标，归档。”或“处置效果不足，退回待处置。” |
| reviewHealthStatus | enum | 是 | 复核后健康状态 |

5. 返回数据结构：`data` 为 `WorkOrder完整版`。
6. 异常/边界与后端职责：
   - 仅 `inspector` 角色可调：`40302`。
   - 仅 `reviewing` 状态可复核，否则 `40902`。
   - 单位隔离：同 3.4.4，否则 `40303`。
   - 后端自动填充 `reviewerId/reviewerName`（`User.username`）、`reviewResult`（`passed`/`rework`）、`reviewedAt`；通过时写 `archivedAt`，退回时状态回 `processing`。
   - 后端同时将 `Tree.healthStatus` 更新为 `reviewHealthStatus`。
7. 与前端 mock 逻辑的对应关系：`WorkbenchPanel.vue` 的 `reviewOrder()`、`GuidePage.vue` 的 `submitReviewInGuide()`；当前前端手工拼 `reviewUserName`（硬编码“巡检人员”）、`reviewTime` 与 `reviewedAt`，并 `emit("updateTree")`。

### 3.4.6 工单导出

1. 接口名称：导出工单台账 CSV
2. 调用场景：`WorkbenchPanel.vue` 工具栏“导出工单台账”（`exportOrders()`）
3. 请求方式与路径：`GET /api/work-orders/export`
4. 请求参数：复用 3.4.1 的筛选参数（`status/siteId/keyword` 等）。
5. 返回数据结构：CSV 文件流，`Content-Type: text/csv;charset=utf-8`，建议带 BOM，列与当前前端一致：工单编号、树木ID、问题类型、状态、创建人、创建时间、处置时间、复核时间、归档时间。
6. 异常/边界：空数据返回仅含表头的 CSV。
7. 与前端 mock 逻辑的对应关系：`WorkbenchPanel.vue` 的 `exportOrders()`（当前用 Blob 在前端生成）。若后端始终返回全量列表，本接口可暂缓；采用分页后必须由后端导出。

## 3.5 游客线索模块

### 3.5.1 获取游客线索列表

1. 接口名称：获取游客线索列表
2. 调用场景：`WorkbenchPanel.vue` “游客线索” Tab，表格加载 `visitorLeads`
3. 请求方式与路径：`GET /api/visitor-leads`
4. 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| status | enum | 否 | `new/converted`；Tab 角标统计 `new` 数量 |
| page | number | 否 | 默认 1 |
| pageSize | number | 否 | 默认 20 |

5. 返回数据结构：`data` 为 `PageResult<VisitorLead精简版>`，精简版裁剪 `photos`（列表不展示），并返回 `tree: { code, species }` 摘要。详情抽屉所需 `photos/issueType/issueDescription/locationDescription/healthStatus` 可从列表全量字段或单独详情返回（前端当前从列表对象直接取）。
6. 异常/边界：游客访问返回 `40302`；空列表返回 `list: []`。
7. 与前端 mock 逻辑的对应关系：`mockApi.js` 的 `createInitialVisitorLeads()`、`App.vue` 的 `visitorLeads`。

### 3.5.2 提交游客线索

1. 接口名称：提交游客线索
2. 调用场景：`TreeDetailDrawer.vue` 游客抽屉“提交线索”，对应 `App.vue` 的 `createVisitorLead()`
3. 请求方式与路径：`POST /api/visitor-leads`
4. 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| treeId | string | 是 | 关联树木 |
| issueType | enum | 是 | 问题类型 |
| issueDescription | string | 是 | 问题描述 |
| locationDescription | string | 否 | 相对位置 |
| photos | Photo[] | 是 | 现场照片（前端必填，最多 3 张） |

5. 返回数据结构：`data` 为 `VisitorLead完整版`（状态 `new`）。
6. 异常/边界与后端职责：
   - 后端生成 `leadNo`，记录 `submitterId/submitterName`（建议新增字段）。
   - 树木不存在：`40401`；缺照片/描述：`40001`。
7. 与前端 mock 逻辑的对应关系：`TreeDetailDrawer.vue` 的 `submitLead()`、`App.vue` 的 `createVisitorLead()`。

### 3.5.3 编辑游客线索

1. 接口名称：编辑游客线索
2. 调用场景：`WorkbenchPanel.vue` 线索详情抽屉，巡检人员修改 `issueType/issueDescription/locationDescription/healthStatus` 后转工单（`convertLeadFromDrawer()`）
3. 请求方式与路径：`PUT /api/visitor-leads/:id`
4. 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| issueType | enum | 是 | 问题类型 |
| issueDescription | string | 是 | 问题描述 |
| locationDescription | string | 否 | 相对位置 |
| healthStatus | enum | 是 | 健康状态（线索抽屉独有字段） |

5. 返回数据结构：`data` 为 `VisitorLead完整版`。
6. 异常/边界：仅巡检可编辑：`40302`；已转工单建议禁止编辑：`40903`。
7. 与前端 mock 逻辑的对应关系：`WorkbenchPanel.vue` 的 `leadEditForm`/`leadHealthStatus`；也可将编辑字段合并进转工单接口（见 3.5.5），由后端团队选择其一。

### 3.5.4 删除游客线索

1. 接口名称：删除游客线索
2. 调用场景：`WorkbenchPanel.vue` 线索详情抽屉“删除”，对应 `App.vue` 的 `deleteVisitorLead()`
3. 请求方式与路径：`DELETE /api/visitor-leads/:id`
4. 请求参数：路径参数 `id`
5. 返回数据结构：`data: null`。
6. 异常/边界：仅巡检可删除：`40302`；不存在 `40401`；已转工单是否允许删除需产品确认（建议允许，但不影响已生成工单）。
7. 与前端 mock 逻辑的对应关系：`App.vue` 的 `deleteVisitorLead()`。

### 3.5.5 游客线索转工单

1. 接口名称：游客线索转正式工单
2. 调用场景：`WorkbenchPanel.vue` 线索抽屉点击“转工单”，对应 `App.vue` 的 `convertVisitorLeadToWorkOrder()`
3. 请求方式与路径：`POST /api/visitor-leads/:id/convert`
4. 请求参数（可选，若采用 3.5.3 单独编辑，则此处可为空）：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| issueType | enum | 否 | 编辑后的问题类型 |
| issueDescription | string | 否 | 编辑后的问题描述 |
| locationDescription | string | 否 | 编辑后的相对位置 |
| healthStatus | enum | 否 | 编辑后的健康状态 |

5. 返回数据结构：`data` 为 `WorkOrder完整版`。
6. 异常/边界与后端职责：
   - 仅 `inspector` 可转换：`40302`（前端已有“只有巡检人员可以将游客线索转为正式工单”校验）。
   - 线索已转换：`40903`，提示“该线索已转为工单”。
   - 后端在一个事务内：创建 `processing` 工单（`sourceLeadId = lead.id`）、线索置 `converted` 并写 `convertedAt/convertedOrderId`、按传入 `healthStatus` 更新树木健康状态。
   - 创建人自动填充当前巡检 `username`；工单 `siteId` 取自树木。
7. 与前端 mock 逻辑的对应关系：`App.vue` 的 `convertVisitorLeadToWorkOrder()`（当前在同一函数内拼工单、改线索、改树木）。

## 3.6 导览与打卡模块

### 3.6.1 获取打卡记录列表

1. 接口名称：获取打卡记录列表
2. 调用场景：
   - `GuidePage.vue` 游客照片墙（`photoWallPhotos`）；
   - `App.vue` 打卡排行（`checkInLeaderboard`）与树种图鉴解锁（`unlockedSpecies`）均可由本接口数据派生。
3. 请求方式与路径：`GET /api/check-ins`
4. 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| treeId | string | 否 | 按树木过滤 |
| page | number | 否 | 默认 1 |
| pageSize | number | 否 | 默认 50（照片墙需要较多数据） |

5. 返回数据结构：`data` 为 `PageResult<CheckInRecord完整版>`。
6. 异常/边界：无数据返回空列表；图片地址失效前端应展示占位图（后端无法控制）。
7. 与前端 mock 逻辑的对应关系：`App.vue` 的 `checkInRecords` 初始数组、`photoWallPhotos/checkInLeaderboard/unlockedSpecies` computed。

### 3.6.2 新增打卡

1. 接口名称：新增游客打卡
2. 调用场景：`GuidePage.vue` 游客树木详情抽屉“拍照打卡”，对应 `App.vue` 的 `addCheckIn()`
3. 请求方式与路径：`POST /api/check-ins`
4. 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| treeId | string | 是 | 关联树木 |
| photo | Photo | 是 | 已上传的打卡照片（当前前端直接 `URL.createObjectURL`，需先走 3.2.6） |

5. 返回数据结构：`data` 为 `CheckInRecord完整版`（`treeCode/species` 由后端从树木派生快照）。
6. 异常/边界：树木不存在 `40401`；缺照片 `40001`。
7. 与前端 mock 逻辑的对应关系：`App.vue` 的 `addCheckIn()`、`GuidePage.vue` 的 `onCameraCapture()`。

### 3.6.3 点赞/取消点赞

1. 接口名称：打卡点赞/取消点赞
2. 调用场景：`GuidePage.vue` 照片墙爱心按钮，对应 `App.vue` 的 `toggleLike()`
3. 请求方式与路径：`PATCH /api/check-ins/:id/like`
4. 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| liked | boolean | 是 | true 点赞；false 取消点赞 |

5. 返回数据结构：`data` 为 `CheckInRecord完整版`（或 `{ likeCount, liked }`）。
6. 异常/边界：记录不存在 `40401`；重复点赞按幂等处理（同一用户重复点赞不重复计数）。
7. 与前端 mock 逻辑的对应关系：`App.vue` 的 `toggleLike()`（当前以用户名字符串数组模拟）。

### 3.6.4 打卡排行

1. 接口名称：获取打卡排行
2. 调用场景：`GuidePage.vue` 游客右侧“打卡排行”卡片，对应 `App.vue` 的 `checkInLeaderboard` computed
3. 请求方式与路径：`GET /api/check-ins/leaderboard`
4. 请求参数：无
5. 返回数据结构：`data` 为 `[{ treeId, treeCode, species, count }]`，按 `count` 降序。
6. 异常/边界：无数据返回空数组。
7. 与前端 mock 逻辑的对应关系：`App.vue` 的 `checkInLeaderboard`。也可由 3.6.1 列表派生，本接口为可选优化。

### 3.6.5 树种图鉴解锁

1. 接口名称：获取树种图鉴解锁状态
2. 调用场景：`GuideSection.vue` 游客“树种图鉴”进度与解锁卡片，对应 `App.vue` 的 `unlockedSpecies`/`allSpecies`
3. 请求方式与路径：`GET /api/check-ins/atlas`
4. 请求参数：无
5. 返回数据结构：`data` 为 `{ total: number, unlocked: string[], unlockedCount: number }`（`unlocked` 为已打卡去重后的树种名列表）。
6. 异常/边界：无打卡时 `unlocked` 为空数组，进度 0。
7. 与前端 mock 逻辑的对应关系：`App.vue` 的 `unlockedSpecies` 与 `allSpecies`。也可由 3.6.1 列表派生，本接口为可选优化。

## 3.7 待补充交互逻辑清单（当前无接口或需前端先明确）

| 位置 | 现状 | 建议 |
|---|---|---|
| `LoginPage.vue` 登录页“437 采集树木” | 硬编码数字 | 接入 `GET /api/stats/overview` |
| `App.vue` 顶栏角色切换器 | 演示用，不重新登录直接切角色 | 真实后端下删除，改为重新登录 |
| `TreeDetailDrawer.vue` “补充树木照片” | 直接插入固定 Unsplash URL | 必须先走文件上传，再 `PATCH /api/trees/:id` |
| `MapPage.vue` 添加树木表单 | 无 `siteId` 字段；`App.addTree()` 默认 `siteId="site"`、`siteName=locationDescription` | 新增园区选择（默认当前用户单位），后端拒绝非法 siteId |
| `MapPage.vue` 添加树木健康状态选项 | 只有 `healthy/problem`，缺 `warning` | 补齐枚举，与全局 `healthOptions` 一致 |
| `GuideSection.vue` 非游客 fallback 打卡 | 纯前端本地 `fallbackUnlocked`；当前路由下该分支不可达 | 若保留需明确业务归属，否则删除；不设计接口 |
| `WorkbenchPanel.vue` 工单导出 | 仅导出当前内存列表 | 采用分页后改由 `GET /api/work-orders/export` |
| 游客线索提交人 | 当前未记录 | 建议 `VisitorLead` 新增 `submitterId/submitterName` |
| 工单状态 `created` | 有枚举与“已创建”文案，但无创建入口 | 保留枚举兼容；创建接口直接生成 `processing` |

---

# 四、接口清单总表

| 模块 | 接口名称 | 请求方式 | 路径 | 简要说明 |
|---|---|---|---|---|
| 认证与用户 | 用户登录 | POST | `/api/auth/login` | 账号密码角色登录，返回 token 与用户信息 |
| 认证与用户 | 用户注册 | POST | `/api/auth/register` | 注册用户；内部角色必填用户名与两个公园之一 |
| 认证与用户 | 获取当前用户 | GET | `/api/auth/me` | 恢复登录态 |
| 认证与用户 | 退出登录 | POST | `/api/auth/logout` | 退出并失效 token |
| 认证与用户 | 获取单位选项 | GET | `/api/organizations` | 注册单位下拉 |
| 树木档案与地图 | 获取树木列表 | GET | `/api/trees` | 地图点位、搜索、筛选、选树下拉 |
| 树木档案与地图 | 获取树木详情 | GET | `/api/trees/:id` | 树木详情抽屉 |
| 树木档案与地图 | 新增树木 | POST | `/api/trees` | 添加树木，后端生成编号与 siteId 校验 |
| 树木档案与地图 | 更新树木档案 | PATCH | `/api/trees/:id` | 编辑档案/健康状态/照片 |
| 树木档案与地图 | 周边树木查询 | GET | `/api/trees/nearby` | 按经纬度与半径过滤排序，返回动态 distance |
| 文件 | 文件上传 | POST | `/api/files` | 统一图片上传，返回 Photo |
| 统计看板 | 获取树木统计概览 | GET | `/api/stats/overview` | 统计卡、图表、生态效益 |
| 工单管理 | 获取工单列表 | GET | `/api/work-orders` | 工单表格、状态统计、待处理列表，单位隔离 |
| 工单管理 | 获取工单详情 | GET | `/api/work-orders/:id` | 工单详情抽屉 |
| 工单管理 | 创建工单 | POST | `/api/work-orders` | 创建 processing 工单，自动填充创建人用户名 |
| 工单管理 | 处置工单 | PATCH | `/api/work-orders/:id/process` | 待处置转待复核，自动填充处置人用户名 |
| 工单管理 | 复核工单 | PATCH | `/api/work-orders/:id/review` | 通过归档或退回待处置，自动填充复核人用户名 |
| 工单管理 | 导出工单台账 | GET | `/api/work-orders/export` | 导出 CSV（分页后必选） |
| 游客线索 | 获取游客线索列表 | GET | `/api/visitor-leads` | 线索表格与状态角标 |
| 游客线索 | 提交游客线索 | POST | `/api/visitor-leads` | 游客提交问题线索 |
| 游客线索 | 编辑游客线索 | PUT | `/api/visitor-leads/:id` | 巡检编辑线索字段 |
| 游客线索 | 删除游客线索 | DELETE | `/api/visitor-leads/:id` | 删除线索 |
| 游客线索 | 线索转工单 | POST | `/api/visitor-leads/:id/convert` | 线索转正式工单，关联双方记录 |
| 导览与打卡 | 获取打卡记录列表 | GET | `/api/check-ins` | 照片墙与打卡数据源 |
| 导览与打卡 | 新增打卡 | POST | `/api/check-ins` | 拍照打卡 |
| 导览与打卡 | 点赞/取消点赞 | PATCH | `/api/check-ins/:id/like` | 照片墙点赞 |
| 导览与打卡 | 打卡排行 | GET | `/api/check-ins/leaderboard` | 打卡排行（可选） |
| 导览与打卡 | 树种图鉴解锁 | GET | `/api/check-ins/atlas` | 图鉴解锁状态（可选） |

## 对接优先级建议

1. 认证与用户（登录/注册/当前用户/单位），因为角色与单位是后续所有数据隔离的基础。
2. 树木档案（列表/详情/新增/更新/文件上传），因为工单、线索、打卡都依赖树木数据。
3. 工单管理（列表/创建/处置/复核），这是核心业务闭环。
4. 游客线索（提交/查看/转换）。
5. 导览与打卡（打卡/点赞/排行/图鉴）。
6. 统计与导出（可后置，也可随树木/工单接口一并提供）。
