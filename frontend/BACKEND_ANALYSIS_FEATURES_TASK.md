# 一、任务清单

## 1. 生态价值数据准备

- 为每棵树维护六项生态效益及其货币价值：碳储量、年固碳量、年产氧量、年截留雨水、年净化空气、年节能。
- 按业务口径计算每棵树的单树生态价值：碳储量的货币价值不参与合计，其余五项货币价值之和即为该树的生态价值。
- 支持对全部树木或指定园区树木重新计算生态价值，计算结果可覆盖更新，并记录计算版本与计算时间，保证结果可追溯、可重复执行。

## 2. 网格划分与分级（PostGIS 动态渔网）

- 网格由后端基于 PostGIS 动态渔网生成：按请求中的网格尺寸实时划分网格。
- 依据树木坐标与网格的空间包含关系，确定每棵树所属网格，确保每棵树只归属一个网格。
- 统计每个网格的树木数量、总生态价值、健康预警数量。
- 按网格总生态价值将网格划分为 1-5 级（5 级最高），供地图分级渲染。
- 支持按园区过滤、按地图范围过滤、按网格尺寸动态调整查询；同一条件下查询结果必须稳定。
- 网格边界以 WGS84 坐标返回；网格面积统计使用适合的投影口径，保证“单位面积生态价值”计算准确。

## 3. 单树生态价值输出

- 在树木列表和树木详情数据中输出每棵树的单树生态价值，供地图树点按价值做符号大小或透明度渲染。

## 4. 网格内树木查询

- 提供按网格查询树木列表的能力，按单树生态价值从高到低排序。
- 返回勾选批量建单所需的基础信息：树木编号、树种、胸径、健康状态、位置、单树生态价值等。

## 5. 批量创建重点保护巡检工单

- 提供一次提交多棵树的批量创建工单能力，生成“重点保护巡检”类型工单。
- 创建前逐树校验：树木是否存在、是否已有在办工单、当前管理员是否有权限。
- 对每棵树的创建结果分别给出成功或失败原因，成功与失败明细一起返回。
- 与现有工单模块负责人确认单条创建接口的兼容性调整方案（例如支持传入多棵树），并评估对既有调用场景的影响，确保单棵树创建、巡检上报、游客线索转工单等场景不受影响。

## 6. 权限控制

- 管理员可查看全部园区数据，不限制园区。

## 7. 联调与自测

- 验证网格分级、树点价值、网格内树木排序、批量建单成功/失败明细、重复提交不重复建单、权限拦截均符合预期。

# 二、前后端接口约定

本文档供前后端共同确认接口契约，只描述前后端交互，不涉及后端内部数据库设计或算法实现。通用约定沿用 `BACKEND_API_CONTRACT.md`：接口挂 `/api` 前缀、JSON 请求响应、统一包装 `{ code, message, data }`、列表分页 `page/pageSize/total/list`、JWT 鉴权、WGS84 坐标、时间格式 `YYYY-MM-DD HH:mm:ss`。

本功能仅管理员可使用，前端需携带管理员 token；其他角色访问返回 `40302`。错误码沿用既有约定（`40001/40002/40302/40303/40401/40902` 等）。

## 接口一：获取生态价值热点网格

- 接口用途：对应流程第 1 步，为地图网格图层提供分级渲染数据。
- 请求方式与路径：`GET /api/analysis/eco-hotspot`
- 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| siteId | enum | 否 | 园区过滤，缺省为全部 |
| cellSize | number | 否 | 网格边长（米），默认 200，范围 50-2000 |
| bbox | string | 否 | 地图范围限制，格式 `lng1,lat1,lng2,lat2` |
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页数量，默认 20，上限 200 |

- 返回数据结构：`data` 为 `{ list: HotspotGrid[], total, page, pageSize }`。

HotspotGrid 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| gridId | string | 网格唯一标识，后续查询网格内树木时使用 |
| siteId | string | 园区 |
| siteName | string | 园区显示名 |
| geometry | object | 网格边界/范围，WGS84 GeoJSON Polygon |
| treeCount | number | 网格内树木数量 |
| warningCount | number | 网格内健康预警树木数量 |
| totalValueYuan | number | 网格内树木总生态价值（元） |
| valuePerTree | number | 网格内平均每棵树的生态价值（元/棵） |
| level | number | 效益等级，1-5，5 为最高 |
| topTreeIds | string[] | 单树生态价值最高的前 3 棵树标识 |

- 与已有接口的关系：新增接口。网格等级由后端计算并返回 `level`，前端只按 `level` 使用 ClassBreaksRenderer 分级渲染，不自行重新分档；数据来源于现有树木档案与生态价值计算结果。

## 接口二：获取树木列表

- 接口用途：对应流程第 2 步，为地图树点图层提供单树生态价值，前端用 visualVariables 按价值控制符号大小或透明度。
- 请求方式与路径：`GET /api/trees`（复用现有接口）
- 请求参数：复用现有接口参数（`keyword/species/healthStatus/dbhMin/dbhMax/siteId` 等），无需新增。
- 返回数据结构：沿用现有约定返回全量树木数组，每棵树新增 `eco: EcoBenefit | null`，无生态价值数据时返回 `null`。

EcoBenefit 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| carbonStorageYuan | number | 碳储量货币价值（元），不参与单树生态价值合计 |
| carbonSequestrationYuan | number | 年固碳量货币价值（元） |
| oxygenProductionYuan | number | 年产氧量货币价值（元） |
| stormwaterInterceptionYuan | number | 年截留雨水货币价值（元） |
| airPurificationYuan | number | 年净化空气货币价值（元） |
| energySavingYuan | number | 年节能货币价值（元） |
| annualValueYuan | number | 单树生态价值（元），即除碳储量外其余五项之和 |
| calcVersion | string | 计算版本 |
| calculatedAt | string | 计算时间，格式 `YYYY-MM-DD HH:mm:ss` |

- 与已有接口的关系：扩展现有 `GET /api/trees` 和 `GET /api/trees/:id`，新增 `eco` 对象，不修改既有字段；前端对无 `eco` 的树按默认大小渲染。

## 接口三：获取网格内树木列表

- 接口用途：对应流程第 3 步，管理员点击某个网格后，弹出该网格范围内的树木列表供勾选。
- 请求方式与路径：`GET /api/analysis/eco-hotspot/:gridId/trees`
- 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| gridId | string | 是 | 路径参数，来自接口一返回的 `gridId` |
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页数量，默认 20 |

- 返回数据结构：`data` 为 `{ list: GridTreeItem[], total, page, pageSize }`。

GridTreeItem 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| treeId | string | 树木标识，批量建单时提交 |
| code | string | 树木业务编号 |
| species | string | 树种 |
| dbh | number | 胸径（cm） |
| healthStatus | enum | `healthy/warning/problem` |
| longitude | number | 经度（WGS84） |
| latitude | number | 纬度（WGS84） |
| locationDescription | string | 位置描述 |
| annualValueYuan | number | 单树生态价值（元），用于排序与展示 |

- 排序约定：按 `annualValueYuan` 从高到低；无生态价值数据的树排在末尾。
- 与已有接口的关系：新增接口，树木字段与树木档案数据一致；返回的 `treeId` 直接用于批量创建工单请求。

## 接口四：批量创建重点保护巡检工单

- 接口用途：对应流程第 4-5 步，管理员勾选若干棵树后，批量生成“重点保护巡检”类型工单。
- 请求方式与路径：`POST /api/work-orders`（复用现有工单创建接口，做兼容性扩展）
- 复用原则：不重新设计一套新接口，而是在现有工单创建接口上扩展批量能力，并保持单棵树创建场景兼容。
- 兼容性调整建议：
  - 保留现有 `treeId` 单棵参数，既有调用方（巡检上报、单棵创建、游客线索转工单等）继续使用 `treeId` 时行为与返回结构不变。
  - 新增 `treeIds` 数组参数用于批量创建，与 `treeId` 二选一；请求同时携带时以 `treeIds` 为准。
  - `issueType` 枚举新增“重点保护巡检”，本流程固定传该值。
  - 可选扩展：新增 `priorityLevel`、`sourceType`、`sourceRefId` 字段记录来源网格，便于后续溯源统计；若工单模块暂不支持可先不加。
- 必须确认事项：`treeId → treeIds` 的兼容调整需要与已有工单模块负责人确认，评估是否影响其他调用 `POST /api/work-orders` 的场景，并确保单棵创建时保持原参数与原返回结构不变。
- 请求参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| treeIds | string[] | 批量时二选一 | 树木标识数组，1-200 棵 |
| treeId | string | 单棵时二选一 | 保留现有单棵创建参数 |
| issueType | enum | 是 | 固定传“重点保护巡检” |
| issueDescription | string | 否 | 问题描述，缺省使用后端默认文案 |
| healthStatus | enum | 否 | 创建时树木健康状态，与单棵创建接口含义一致 |
| createPhotos | Photo[] | 否 | 创建照片，最多 4 张 |
| priorityLevel | enum | 否 | 建议新增，`normal/important/critical` |
| sourceType | enum | 否 | 建议新增，本流程传 `eco_hotspot` |
| sourceRefId | string | 否 | 建议新增，来源网格 `gridId` |

- 返回数据结构：
  - 批量场景：`data` 为 `{ successCount, failedCount, success: WorkOrder精简版[], failed: [{ treeId, reason }] }`。
  - 单棵场景：保持现有返回结构不变，返回 `WorkOrder完整版`。
  - 失败原因示例：`树木不存在`、`已有在办工单`。
- 校验规则：逐树校验树木是否存在、是否已有 `processing/reviewing` 在办工单、当前管理员是否有权限；单棵树失败不影响其他树创建。
- 权限：仅管理员可调用，其他角色返回 `40302`。
- 与已有接口的关系：本接口为现有 `POST /api/work-orders` 的兼容扩展，新增批量参数与“重点保护巡检”枚举值，不替代既有工单流转接口。


## 接口清单总览

| 流程环节 | 请求方式与路径 | 说明 |
|---|---|---|
| 网格图层 | `GET /api/analysis/eco-hotspot` | 新增，返回五级网格数据 |
| 树点图层 | `GET /api/trees` | 复用并扩展 `eco` 字段 |
| 网格树木弹窗 | `GET /api/analysis/eco-hotspot/:gridId/trees` | 新增，返回可勾选树木列表 |
| 批量创建工单 | `POST /api/work-orders` | 复用现有接口并兼容扩展批量参数 |
