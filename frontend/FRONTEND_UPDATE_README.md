# 前端更新说明

为谭雨欣负责改动的内容

## 本次主要更新

- 将前端角色调整为游客、巡检人员、养护人员。
- 删除管理员入口、管理员权限和派单相关逻辑。
- 登录页改为账号登录和注册表单。
- 新增 mock 登录注册适配层，后续可替换为真实后端接口。
- 游客可提交树木线索，线索需要上传照片。
- 巡检人员可查看游客线索，并将线索转为正式工单。
- 养护人员只填写处置措施并上传处置照片，提交后工单进入待复核，树木健康状态自动变为待观察。
- 巡检人员复核时选择最终健康状态；复核通过后归档，复核不通过则退回待处置。
- 树木健康状态统一为正常、异常、待观察。
- 游客不能进入工单页，内部角色可以进入工单页。

## 主要修改文件

- `src/App.vue`
- `src/api/authApi.js`
- `src/api/mockApi.js`
- `src/components/LoginPage.vue`
- `src/components/TreeDetailDrawer.vue`
- `src/components/WorkbenchPanel.vue`
- `src/pages/WorkbenchPage.vue`
- `src/pages/MapPage.vue`
- `src/styles.css`

## 演示账号

| 身份 | 账号 | 密码 |
|------|------|------|
| 游客 | visitor | 123456 |
| 巡检人员 | inspector | 123456 |
| 养护人员 | maintenance | 123456 |

## 运行方式

```bash
cd /Users/csho0o/Documents/esri-dev/TreeInformationService/frontend
npm install
npm run dev
```

如果本地服务已启动，可直接打开终端显示的 Vite 地址。

## 后续对接重点

- 后端接口到位后，优先替换 `src/api/authApi.js`。
- 工单、游客线索、照片上传接口建议单独拆到新的 API 文件。
- 当前照片上传和数据保存都是前端 mock，刷新页面后不会持久保留。
