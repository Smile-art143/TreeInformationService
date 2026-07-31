import { createRouter, createWebHashHistory } from "vue-router";

const routes = [
  { path: "/", redirect: "/map" },
  { path: "/map", name: "map", component: () => import("../pages/MapPage.vue") },
  { path: "/dashboard", name: "dashboard", component: () => import("../pages/DashboardPage.vue") },
  { path: "/workbench", name: "workbench", component: () => import("../pages/WorkbenchPage.vue") },
  { path: "/guide", name: "guide", component: () => import("../pages/GuidePage.vue") },
  { path: "/routes", name: "routes", component: () => import("../pages/RoutesPage.vue") },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
