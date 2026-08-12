import { createRouter, createWebHashHistory } from "vue-router";

const routes = [
  { path: "/", redirect: "/map" },
  { path: "/map", name: "map", component: () => import("../pages/MapPage.vue") },
  { path: "/workbench", name: "workbench", component: () => import("../pages/WorkbenchPage.vue") },
  { path: "/guide", name: "guide", component: () => import("../pages/GuidePage.vue") },
  { path: "/routes", name: "routes", component: () => import("../pages/RoutesPage.vue") },
  { path: "/mobile", redirect: "/mobile/map" },
  { path: "/mobile/:tab(map|guide|tasks|me|routes)?", name: "mobile", component: () => import("../pages/MobilePage.vue") },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
