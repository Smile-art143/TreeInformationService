# 西安城市树木信息服务平台

## Xi'an Urban Tree Information Service Platform

基于 Vue 3 构建的城市树木信息化管理前端应用，支持地图可视化、统计分析、工单管理、导览与路线规划等功能，服务于西安城市树木的档案管理与养护协同。

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | **Vue 3** (Composition API + `<script setup>`) |
| 构建工具 | **Vite 6** |
| 路由 | **Vue Router 4** (Hash 模式) |
| UI 组件库 | **Ant Design Vue 4** |
| 地图 | **ArcGIS Maps SDK for JavaScript 4** |
| 图表 | **ECharts 5** + **vue-echarts 7** |
| 图标 | **Lucide Vue Next** |
| HTTP 请求 | **Axios** |

---

## 功能模块

### 地图 (Map)
- ArcGIS 底图展示城市树木空间分布
- 按树种、胸径 (DBH)、健康状况筛选树木
- 点击树木标记查看详细信息
- 树木点位聚合与搜索

### 统计看板 (Dashboard)
- 树木总数、树种占比、健康状态分布等关键指标
- ECharts 可视化图表展示统计趋势
- Top 树种排名与占比分析

### 工单管理 (Workbench)
- 树木养护工单的创建、指派、处理、复核与归档
- 工单状态流转：待派单 → 待处置 → 处理中 → 待复核 → 已归档
- 支持返工机制
- 养护人员分配

### 导览 (Guide)
- 树木导览信息展示
- 重点/古树名木介绍

### 路线 (Routes)
- 树木游览路线规划与展示

### 多角色支持
| 角色 | 说明 |
|------|------|
| 游客 (Visitor) | 浏览地图、查看树木信息、使用导览功能 |
| 管理员 (Admin) | 全部功能，包括数据管理与工单调度 |
| 巡检人员 (Inspector) | 上报问题、创建工单 |
| 养护人员 (Maintenance) | 接收并处理养护工单 |

### 国际化
- 中文 / English 双语切换
- 支持大字体 / 标准字号切换，提升无障碍体验

---

## 项目结构

```
frontend/
├── index.html                          # 入口 HTML
├── package.json                        # 依赖与脚本
├── vite.config.js                      # Vite 配置
└── src/
    ├── main.js                         # 应用入口，注册插件
    ├── App.vue                         # 根组件，全局状态与布局
    ├── styles.css                      # 全局样式
    ├── router/
    │   └── index.js                    # 路由配置 (Hash 模式)
    ├── api/
    │   └── mockApi.js                  # 模拟数据与业务逻辑
    ├── data/
    │   └── trees.json                  # 树木静态数据
    ├── components/
    │   ├── ArcGISTreeMap.vue           # ArcGIS 地图组件
    │   ├── FilterPanel.vue            # 筛选面板
    │   ├── GuideSection.vue           # 导览区域
    │   ├── LoginPage.vue              # 登录页面
    │   ├── RoutesSection.vue          # 路线区域
    │   ├── StatsPanel.vue             # 统计面板
    │   ├── TreeDetailDrawer.vue       # 树木详情抽屉
    │   └── WorkbenchPanel.vue         # 工单面板
    └── pages/
        ├── DashboardPage.vue          # 统计看板页
        ├── GuidePage.vue              # 导览页
        ├── MapPage.vue                # 地图页
        ├── RoutesPage.vue             # 路线页
        └── WorkbenchPage.vue          # 工单管理页
```

---

## 快速开始

### 环境要求

- **Node.js** >= 18
- **npm** >= 9

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

开发服务器默认运行在 `http://localhost:5173`，并绑定 `0.0.0.0` 以便局域网访问。

### 构建生产版本

```bash
npm run build
```

构建产物输出至 `dist/` 目录。

### 预览生产构建

```bash
npm run preview
```

---

## 路由表

| 路径 | 名称 | 页面 | 说明 |
|------|------|------|------|
| `/` | - | - | 重定向至 `/map` |
| `/map` | map | MapPage | 地图主页 |
| `/dashboard` | dashboard | DashboardPage | 统计看板 |
| `/workbench` | workbench | WorkbenchPage | 工单管理（游客不可访问） |
| `/guide` | guide | GuidePage | 导览 |
| `/routes` | routes | RoutesPage | 路线规划 |

---

## 配置

Vite 配置位于 `vite.config.js`：

```js
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
  },
});
```

可通过修改 `server.port` 调整开发服务器端口。

---

## 设计风格

项目采用以深色文字与浅色背景为主的高对比度设计，色彩方案灵感源自西安城市风貌：

- 主色调：绿色系 (`#50802c` / `#2F7D32`)
- 辅助色：石材色调 (`#7a8f2a`)
- 字体：优先使用系统原生中文字体 (PingFang SC / Microsoft YaHei) 与西文字体 (Helvetica Neue)
- 支持明暗主题适配

---

## 许可

内部项目，仅供授权使用。
