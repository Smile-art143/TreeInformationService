import { createRouter, createWebHashHistory } from "vue-router";

const routes = [
  { path: "/", redirect: "/map" },
  { path: "/map", name: "map", component: () => import("../pages/MapPage.vue") },
  { path: "/eco", name: "eco", component: () => import("../pages/EcoValuePage.vue") },
  { path: "/workbench", name: "workbench", component: () => import("../pages/WorkbenchPage.vue") },
  { path: "/guide", name: "guide", component: () => import("../pages/GuidePage.vue") },
  { path: "/review", name: "review", component: () => import("../pages/ReviewPage.vue") },
  { path: "/mobile", redirect: "/mobile/map" },
  { path: "/mobile/:tab(map|guide|tasks|me|routes|add-tree)?", name: "mobile", component: () => import("../pages/MobilePage.vue") },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
