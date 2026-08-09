# 谭雨欣负责模块后端接口建议

本文只记录本次前端改动涉及的后端接口建议，供后端对接时参考。

## 1. 登录注册

### 登录

`POST /api/auth/login`

请求：

```json
{
  "account": "inspector",
  "password": "123456",
  "role": "inspector"
}
```

响应：

```json
{
  "id": "user-1",
  "account": "inspector",
  "role": "inspector",
  "organizationName": "大兴善寺",
  "approvalStatus": "approved",
  "token": "jwt-token"
}
```

说明：

- `role`: `visitor` / `inspector` / `maintenance`
- `approvalStatus`: `pending` / `approved` / `rejected`
- 游客可直接登录；巡检人员、养护人员建议审核通过后才允许登录。

### 注册

`POST /api/auth/register`

请求：

```json
{
  "account": "new_user",
  "password": "123456",
  "role": "maintenance",
  "organizationName": "大兴善寺"
}
```

响应：

```json
{
  "id": "user-2",
  "account": "new_user",
  "role": "maintenance",
  "organizationName": "大兴善寺",
  "approvalStatus": "pending"
}
```

## 2. 游客线索

### 创建游客线索

`POST /api/visitor-leads`

请求：

```json
{
  "treeId": "DX-2",
  "issueType": "枝干异常",
  "issueDescription": "树枝有断裂风险",
  "locationDescription": "山门东侧第三排",
  "photoIds": ["file-1"]
}
```

响应：

```json
{
  "id": "lead-1",
  "leadNo": "LEAD-20260809-001",
  "treeId": "DX-2",
  "status": "new",
  "createdAt": "2026-08-09 10:30:00"
}
```

说明：

- 游客提交线索时照片必填。
- 线索状态：`new` / `converted`。

### 获取游客线索列表

`GET /api/visitor-leads?status=new`

## 3. 正式工单

### 创建正式工单

`POST /api/work-orders`

请求：

```json
{
  "treeId": "DX-2",
  "issueType": "枝干异常",
  "issueDescription": "树枝有断裂风险",
  "locationDescription": "山门东侧第三排",
  "creatorRole": "inspector",
  "photoIds": ["file-1"],
  "healthStatus": "problem"
}
```

响应：

```json
{
  "id": "wo-1",
  "orderNo": "WO-20260809-001",
  "treeId": "DX-2",
  "status": "processing",
  "createdAt": "2026-08-09 10:35:00"
}
```

说明：

- 创建工单照片必填。
- 创建后直接进入 `processing`，不再派单。
- `healthStatus`: `healthy` / `problem` / `warning`。

### 游客线索转正式工单

`POST /api/visitor-leads/{leadId}/convert`

请求：

```json
{
  "issueType": "枝干异常",
  "issueDescription": "树枝有断裂风险",
  "locationDescription": "山门东侧第三排",
  "healthStatus": "problem"
}
```

响应：

```json
{
  "leadId": "lead-1",
  "convertedOrderId": "wo-1",
  "leadStatus": "converted",
  "orderStatus": "processing",
  "convertedAt": "2026-08-09 10:40:00"
}
```

## 4. 工单处置与复核

### 养护人员提交处置

`PATCH /api/work-orders/{orderId}/process`

请求：

```json
{
  "treatmentMeasures": "修剪断枝并清理现场",
  "photoIds": ["file-2"]
}
```

响应：

```json
{
  "id": "wo-1",
  "status": "reviewing",
  "treeHealthStatus": "warning",
  "processedAt": "2026-08-09 11:20:00"
}
```

说明：

- 处置照片必填。
- 养护人员不选择健康状态。
- 提交处置后工单进入 `reviewing`，树木健康状态自动变为 `warning`。

### 巡检人员复核

`PATCH /api/work-orders/{orderId}/review`

请求：

```json
{
  "reviewResult": "passed",
  "reviewComment": "处置效果达标",
  "healthStatus": "healthy"
}
```

响应：

```json
{
  "id": "wo-1",
  "status": "archived",
  "treeHealthStatus": "healthy",
  "reviewedAt": "2026-08-09 12:00:00",
  "archivedAt": "2026-08-09 12:00:00"
}
```

说明：

- `reviewResult`: `passed` / `rework`
- 复核通过后工单状态为 `archived`。
- 复核不通过后工单状态退回 `processing`。
- 巡检人员复核时选择最终树木健康状态。

## 5. 文件上传

`POST /api/uploads`

请求：

```text
multipart/form-data
file: 图片文件
usage: visitor_lead | work_order_create | work_order_process
```

响应：

```json
{
  "id": "file-1",
  "url": "https://example.com/uploads/file-1.jpg",
  "filename": "tree.jpg"
}
```

## 6. 状态枚举

### 角色

```text
visitor      游客
inspector    巡检人员
maintenance  养护人员
```

### 树木健康状态

```text
healthy  正常
problem  异常
warning  待观察
```

### 工单状态

```text
processing  待处置
reviewing   待复核
archived    已归档
```

### 游客线索状态

```text
new        新线索
converted  已转工单
```
