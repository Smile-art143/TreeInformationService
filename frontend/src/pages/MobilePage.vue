<script setup>
import { computed, inject, nextTick, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  BookOpen, Camera, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Compass, Heart, Home, Leaf,
  ListChecks, MapPinned, Navigation, PenLine, Route as RouteIcon, Search, Send, TreePine, UserRound, Wrench, X
} from "lucide-vue-next";
import { message } from "ant-design-vue";
import ArcGISTreeMap from "../components/ArcGISTreeMap.vue";
import MobileAddTreeSection from "../components/MobileAddTreeSection.vue";
import CreateWorkOrderModal from "../components/CreateWorkOrderModal.vue";
import MobileRoutesSection from "../components/MobileRoutesSection.vue";
import {
  fetchNearbyTreesMock, healthLabels, healthOptions, issueTypes, leadStatusLabels, roleLabels, statusLabels
} from "../api/mockApi";
import { planTreeTaskRoute } from "../api/routePlanner";
import { ECO_BENEFIT_METRICS, mockTreeEcoBenefits } from "../api/ecoBenefits";
import { findMatchedPark } from "../data/parkZones";

const app = inject("appState");
const route = useRoute();
const router = useRouter();

const {
  role,
  currentUser,
  currentUserName,
  organizationName,
  trees,
  filteredTrees,
  selectedTree,
  speciesColors,
  treeSearchOptions,
  workOrders,
  visitorLeads,
  checkInRecords,
  unlockedSpecies,
  allSpecies,
  checkInLeaderboard,
  photoWallPhotos,
  setSelectedTree,
  createVisitorLead,
  deleteVisitorLead,
  convertVisitorLeadToWorkOrder,
  createWorkOrder,
  updateWorkOrder,
  updateTree,
  addCheckIn,
  toggleLike,
  handleLogout,
} = app;

const isInspectRole = computed(() => role.value === "maintenance" || role.value === "inspector");

const activeTab = computed(() => {
  const tab = route.params.tab || "map";
  if (role.value !== "visitor" && (tab === "routes" || tab === "guide")) return "map";
  if (role.value === "visitor" && tab === "add-tree") return "map";
  return tab;
});
const tabItems = computed(() => {
  const items = [
    { key: "map", label: "地图", icon: MapPinned },
  ];
  if (isInspectRole.value) {
    items.push({ key: "add-tree", label: "添树", icon: TreePine });
  }
  if (role.value === "visitor") {
    items.push({ key: "routes", label: "路线", icon: RouteIcon });
    items.push({ key: "guide", label: "导览", icon: Compass });
  }
  items.push({ key: "tasks", label: "任务", icon: ListChecks });
  items.push({ key: "me", label: "我的", icon: UserRound });
  return items;
});

const statusColor = { created: "default", processing: "blue", reviewing: "purple", archived: "green" };
const leadStatusColor = { new: "orange", converted: "green" };

const showLeadDrawer = ref(false);
const showCreateOrderModal = ref(false);
const showTaskLeadDrawer = ref(false);
const showOrderDrawer = ref(false);
const activeLead = ref(null);
const activeOrder = ref(null);
const mobileNavigationOrder = ref(null);
const navigationCardCollapsed = ref(true);
const guideAnchorLocation = ref(null);
const treeDetailExpanded = ref(false);
const archiveEditing = ref(false);
const archiveForm = ref({ species: "", dbh: "", story: "" });
const expandedSections = ref({
  nearby: false,
  photos: false,
  atlas: true,
  rank: false,
});
const expandedTaskGroups = ref({});
const photoPage = ref(0);
const atlasPage = ref(0);
const photoPageSize = 4;
const atlasPageSize = 6;

const mobileMapRef = ref(null);
const currentLocation = ref(null);
const isLocating = ref(false);
const isPickingLocation = ref(false);
const isPickingGuideAnchorOnMap = ref(false);
const orderRoutePolyline = ref([]);
const orderRouteMeters = ref(0);
const orderRouteDuration = ref(0);
const orderRouteUsingAmap = ref(false);
const orderRouteSource = ref("straight");
const orderRoutePlanning = ref(false);

// 问题树木选择定位（养护 / 巡检）
const inspectPosition = reactive({ lat: 34.2265, lng: 108.9445 });
const inspectRadius = ref(10);
const inspectResults = ref([]);
const isSearchingInspect = ref(false);
const inspectSelectedTree = ref(null);
const isPickingInspectPosition = ref(false);
const showInspectPanel = ref(false);
const inspectPanelCollapsed = ref(false);
const createOrderPreTree = ref(null);
let inspectSearchDebounce = null;

// 游客查看树木详情（导览附近树木）
const showViewTreeDrawer = ref(false);
const viewingTree = ref(null);
const viewTreeCameraInput = ref(null);

const leadTargetTree = ref(null);
const leadPhotos = ref([]);
const leadForm = ref({
  issueType: issueTypes[0],
  issueDescription: "",
  locationDescription: "",
});

const leadEditForm = ref({
  issueType: issueTypes[0],
  issueDescription: "",
  locationDescription: "",
  healthStatus: "problem",
});

const treatmentPhotos = ref([]);
const treatmentForm = ref({ treatmentMeasures: "" });
const reviewForm = ref({ reviewComment: "", healthStatus: "warning" });

const treeById = (treeId) => trees.value.find((tree) => tree.id === treeId);
const orderTree = computed(() => activeOrder.value ? treeById(activeOrder.value.treeId) : null);
const currentTreePhoto = computed(() => selectedTree.value?.photos?.[0] || "");
const mobileNavigationTree = computed(() => mobileNavigationOrder.value ? treeById(mobileNavigationOrder.value.treeId) : null);

function getDistanceMeters(fromPoint, toPoint) {
  if (!fromPoint || !toPoint) return 0;
  const earthRadius = 6371000;
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const dLat = toRad(toPoint.latitude - fromPoint.latitude);
  const dLng = toRad(toPoint.longitude - fromPoint.longitude);
  const lat1 = toRad(fromPoint.latitude);
  const lat2 = toRad(toPoint.latitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

const nearbyTrees = computed(() => {
  if (!guideAnchorLocation.value) return [];
  return trees.value
    .map((tree) => ({ ...tree, distanceMeters: getDistanceMeters(guideAnchorLocation.value, tree) }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 8);
});
const recentPhotos = computed(() => photoWallPhotos.value.slice(0, 12));
const photoPageCount = computed(() => Math.max(1, Math.ceil(recentPhotos.value.length / photoPageSize)));
const atlasPageCount = computed(() => Math.max(1, Math.ceil(allSpecies.value.length / atlasPageSize)));
const visiblePhotos = computed(() => recentPhotos.value.slice(photoPage.value * photoPageSize, (photoPage.value + 1) * photoPageSize));
const visibleSpecies = computed(() => allSpecies.value.slice(atlasPage.value * atlasPageSize, (atlasPage.value + 1) * atlasPageSize));
const selectedTreeBenefits = computed(() => mockTreeEcoBenefits(selectedTree.value));
const viewingTreeBenefits = computed(() => mockTreeEcoBenefits(viewingTree.value));
const selectedTreeBenefitItems = computed(() => toBenefitItems(selectedTreeBenefits.value));
const viewingTreeBenefitItems = computed(() => toBenefitItems(viewingTreeBenefits.value));
const isPickingGuideAnchor = computed(() => route.query.return === "guide");
const pickerTreeOptions = computed(() => trees.value.slice(0, 6));
const navigationActionLabel = computed(() => role.value === "maintenance" ? "处置" : "复核");
function toBenefitItems(benefits) {
  return ECO_BENEFIT_METRICS.map((metric) => ({
    key: metric.key,
    label: metric.label,
    unit: metric.unit,
    value: benefits?.[metric.key] ?? 0,
    valueYuan: benefits?.[`${metric.key}ValueYuan`] ?? 0,
    includedInTotal: metric.includedInTotal !== false,
  }));
}
const isKeyProtectionOrder = (order) =>
  role.value === "inspector" &&
  order?.issueType === "重点保护巡检" &&
  order?.status === "processing";
const arrivalActionLabel = computed(() =>
  isKeyProtectionOrder(mobileNavigationOrder.value)
    ? "创建工单"
    : `到达后${navigationActionLabel.value}`
);
const orderTaskActionLabel = (order) => {
  if (role.value === "maintenance") return "去现场处置";
  if (isKeyProtectionOrder(order)) return "去巡检";
  return "去现场复核";
};
const currentLocationLabel = computed(() => {
  if (!currentLocation.value) return "未定位";
  return `${Number(currentLocation.value.lat).toFixed(5)}, ${Number(currentLocation.value.lng).toFixed(5)}`;
});
const orderRouteDurationMinutes = computed(() =>
  orderRouteDuration.value ? Math.max(1, Math.round(orderRouteDuration.value / 60)) : 0
);
const guideAnchorLabel = computed(() => {
  if (!guideAnchorLocation.value) return "未选择";
  const lat = Number(guideAnchorLocation.value.latitude).toFixed(5);
  const lng = Number(guideAnchorLocation.value.longitude).toFixed(5);
  return `${guideAnchorLocation.value.name || "地图选点"} · ${lat}, ${lng}`;
});

const roleTaskIntro = computed(() => {
  if (role.value === "visitor") {
    return "线索是游客发现树木异常后提交的现场记录，需要照片和问题描述；巡检确认后才会转成正式工单。";
  }
  if (role.value === "inspector") {
    return "先确认游客线索；待复核工单需要先定位到目标树，现场查看处置结果后再复核归档或退回。";
  }
  return "待处置工单需要先定位到目标树，现场完成处置并上传照片后提交巡检复核。";
});

const profileMetrics = computed(() => {
  if (role.value === "visitor") {
    return [
      { label: "打卡", value: checkInRecords.value.length },
      { label: "线索", value: visitorLeads.value.length },
      { label: "图鉴", value: unlockedSpecies.value.length },
    ];
  }

  if (role.value === "inspector") {
    return [
      { label: "线索", value: visitorLeads.value.filter((lead) => lead.status === "new").length },
      { label: "待复核", value: workOrders.value.filter((order) => order.status === "reviewing").length },
      { label: "工单", value: workOrders.value.length },
    ];
  }

  return [
    { label: "待处置", value: workOrders.value.filter((order) => order.status === "processing").length },
    { label: "待复核", value: workOrders.value.filter((order) => order.status === "reviewing").length },
    { label: "工单", value: workOrders.value.length },
  ];
});

const taskGroups = computed(() => {
  if (role.value === "visitor") {
    return [
      {
        title: "我的游客线索",
        description: "这里记录你提交过的异常线索，状态变为已转工单后说明巡检已经采纳。",
        empty: "暂无提交线索",
        items: visitorLeads.value.map((lead) => ({ type: "lead", data: lead })),
      },
    ];
  }

  if (role.value === "inspector") {
    return [
      {
        title: "重点保护巡检工单",
        description: "生态价值热点下发的重点保护巡检任务，到达后创建正式工单。",
        empty: "暂无重点保护巡检工单",
        items: workOrders.value
          .filter(
            (order) =>
              order.issueType === "重点保护巡检" &&
              order.status === "processing"
          )
          .map((order) => ({ type: "order", data: order })),
      },
      {
        title: "游客线索",
        description: "核对游客提交的问题、位置和照片，确认有效后转为正式工单。",
        empty: "暂无待确认线索",
        items: visitorLeads.value
          .filter((lead) => lead.status === "new")
          .map((lead) => ({ type: "lead", data: lead })),
      },
      {
        title: "待复核工单",
        description: "先导航到目标树查看处置结果，再提交复核结论。",
        empty: "暂无待复核工单",
        items: workOrders.value
          .filter((order) => order.status === "reviewing")
          .map((order) => ({ type: "order", data: order })),
      },
    ];
  }

  return [
    {
      title: "待处置工单",
      description: "先导航到目标树，完成现场处置后上传措施和照片。",
      empty: "暂无待处置工单",
      items: workOrders.value
        .filter((order) => order.status === "processing")
        .map((order) => ({ type: "order", data: order })),
    },
    {
      title: "待复核记录",
      description: "这些工单已提交巡检复核，可查看自己提交的处置记录。",
      empty: "暂无已提交复核的工单",
      items: workOrders.value
        .filter((order) => order.status === "reviewing")
        .map((order) => ({ type: "order", data: order })),
    },
  ];
});

watch(activeOrder, (order) => {
  treatmentForm.value = { treatmentMeasures: "" };
  treatmentPhotos.value = [];
  reviewForm.value = { reviewComment: "", healthStatus: treeById(order?.treeId)?.healthStatus ?? "warning" };
});

watch(selectedTree, (tree) => {
  treeDetailExpanded.value = false;
  archiveEditing.value = false;
});

watch(mobileNavigationOrder, async (order) => {
  if (!order) {
    clearOrderRoute();
    return;
  }
  navigationCardCollapsed.value = true;
  await nextTick();
  focusNavigationTree();
});

watch(
  [role, () => route.params.tab],
  ([currentRole, tab]) => {
    if (currentRole !== "visitor" && (tab === "routes" || tab === "guide")) {
      router.replace("/mobile/map");
    }
    if (currentRole === "visitor" && tab === "add-tree") {
      router.replace("/mobile/map");
    }
  }
);

function goTab(tab) {
  router.push(`/mobile/${tab}`);
}

function toggleSection(key) {
  expandedSections.value[key] = !expandedSections.value[key];
}

function changePagedSection(section, direction) {
  const page = section === "photos" ? photoPage : atlasPage;
  const count = section === "photos" ? photoPageCount.value : atlasPageCount.value;
  page.value = (page.value + direction + count) % count;
}

function toggleTaskGroup(title, index) {
  expandedTaskGroups.value[title] = !isTaskGroupOpen(title, index);
}

function isTaskGroupOpen(title, index = 0) {
  if (expandedTaskGroups.value[title] !== undefined) {
    return expandedTaskGroups.value[title];
  }
  if (title.includes("游客线索")) {
    return false;
  }
  return index === 0;
}

function handleTreeSelect(tree) {
  if (!tree) return;
  if (isPickingGuideAnchor.value) {
    setGuideAnchorLocation({
      latitude: tree.latitude,
      longitude: tree.longitude,
      name: "地图点位",
    });
    return;
  }
  treeDetailExpanded.value = false;
  setSelectedTree(tree);
  if (showInspectPanel.value && isInspectRole.value) {
    inspectSelectedTree.value = tree;
  }
}

function closeTreeSelection() {
  treeDetailExpanded.value = false;
  archiveEditing.value = false;
  setSelectedTree(null);
}

function startEditArchive() {
  if (!selectedTree.value) return;
  archiveForm.value = {
    species: selectedTree.value.species || "",
    dbh: selectedTree.value.dbh || "",
    story: selectedTree.value.story || "",
  };
  archiveEditing.value = true;
}

function saveArchive() {
  const tree = selectedTree.value;
  if (!tree) return;
  if (!archiveForm.value.species.trim()) {
    message.error("请填写树种");
    return;
  }
  updateTree({
    ...tree,
    species: archiveForm.value.species.trim(),
    dbh: Number(archiveForm.value.dbh) || 0,
    story: archiveForm.value.story,
  });
  archiveEditing.value = false;
  message.success("树木档案已保存");
}

function cancelEditArchive() {
  archiveEditing.value = false;
}

function selectGuideAnchor(tree) {
  handleTreeSelect(tree);
}

function setGuideAnchorLocation(location) {
  guideAnchorLocation.value = location;
  expandedSections.value.nearby = true;
  router.replace("/mobile/guide");
  message.success("已选择导览位置");
}

function handleMapClick({ latitude, longitude }) {
  if (isPickingLocation.value) {
    currentLocation.value = { lat: latitude, lng: longitude };
    isPickingLocation.value = false;
    message.success("已设置当前位置");
    planOrderRoute();
    return;
  }
  if (isPickingInspectPosition.value) {
    inspectPosition.lat = latitude;
    inspectPosition.lng = longitude;
    isPickingInspectPosition.value = false;
    message.success("已设置定位点");
    searchInspectTrees();
    return;
  }
  if (!isPickingGuideAnchor.value) return;
  if (!isPickingGuideAnchorOnMap.value) return;
  setGuideAnchorLocation({ latitude, longitude, name: "地图选点" });
}

function chooseGuideAnchorFromMap() {
  isPickingGuideAnchorOnMap.value = false;
  router.push("/mobile/map?return=guide");
}

function startPickGuideAnchor() {
  isPickingGuideAnchorOnMap.value = true;
  message.info("请点击地图任意位置作为导览起点");
}

function locateGuideAnchor() {
  getDeviceLocation(({ latitude, longitude }) => {
    if (!findMatchedPark(latitude, longitude)) {
      message.info("当前位置不在已开通路线的景区缓冲区内，请移动到景区附近或使用「地图选点」");
      return;
    }
    setGuideAnchorLocation({ latitude, longitude, name: "我的定位" });
  });
}

function startTreeGuide(tree = selectedTree.value) {
  if (!tree) {
    chooseGuideAnchorFromMap();
    return;
  }
  guideAnchorLocation.value = {
    latitude: tree.latitude,
    longitude: tree.longitude,
    name: "当前树木附近",
  };
  expandedSections.value.nearby = true;
  goTab("guide");
}

function goCheckIn(tree = selectedTree.value) {
  if (!tree) return;
  guideAnchorLocation.value = {
    latitude: tree.latitude,
    longitude: tree.longitude,
    name: "当前树木附近",
  };
  expandedSections.value.nearby = true;
  goTab("guide");
  openViewTree(tree);
}

function openLeadForTree(tree = selectedTree.value) {
  if (!tree) return;
  leadTargetTree.value = tree;
  leadForm.value = {
    issueType: issueTypes[0],
    issueDescription: "",
    locationDescription: tree.locationDescription || "",
  };
  leadPhotos.value = [];
  showLeadDrawer.value = true;
}

function toPhotoRecords(fileList) {
  return (fileList || []).map((file) => ({
    uid: file.uid,
    name: file.name,
    url: file.url || file.thumbUrl || (file.originFileObj ? URL.createObjectURL(file.originFileObj) : ""),
  }));
}

function submitLead() {
  if (!leadTargetTree.value) return;
  if (!leadForm.value.issueDescription.trim()) {
    message.error("请填写问题描述");
    return;
  }
  if (leadPhotos.value.length === 0) {
    message.error("提交游客线索必须上传照片");
    return;
  }

  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  createVisitorLead({
    id: `lead-${Date.now()}`,
    leadNo: `LEAD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`,
    treeId: leadTargetTree.value.id,
    status: "new",
    issueType: leadForm.value.issueType,
    issueDescription: leadForm.value.issueDescription,
    locationDescription: leadForm.value.locationDescription,
    photos: toPhotoRecords(leadPhotos.value),
    submitterId: currentUser.value?.id,
    submitterName: currentUserName.value,
    createdAt: now,
  });
  showLeadDrawer.value = false;
  message.success("游客线索已提交");
}

function checkInTree(tree = selectedTree.value) {
  if (!tree) return;
  addCheckIn({
    treeId: tree.id,
    treeCode: tree.code,
    species: tree.species,
    photoUrl: tree.photos?.[0],
  });
  message.success(`已打卡 ${tree.code}`);
}

function openViewTree(tree) {
  viewingTree.value = tree;
  showViewTreeDrawer.value = true;
}

function closeViewTree() {
  showViewTreeDrawer.value = false;
}

function openLeadFromViewTree() {
  const tree = viewingTree.value;
  if (!tree) return;
  showViewTreeDrawer.value = false;
  openLeadForTree(tree);
}

function triggerViewTreeCamera() {
  viewTreeCameraInput.value?.click();
}

function onViewTreeCameraCapture(event) {
  const file = event.target.files?.[0];
  if (!file || !viewingTree.value) return;
  const photoUrl = URL.createObjectURL(file);
  addCheckIn({
    treeId: viewingTree.value.id,
    treeCode: viewingTree.value.code,
    species: viewingTree.value.species,
    photoUrl,
  });
  showViewTreeDrawer.value = false;
  message.success(`打卡成功，解锁 ${viewingTree.value.species} 图鉴`);
  event.target.value = "";
}

function handleCreateOrder(order) {
  createWorkOrder(order, { navigate: false });
  showCreateOrderModal.value = false;
  if (isKeyProtectionOrder(mobileNavigationOrder.value)) {
    mobileNavigationOrder.value = null;
    clearOrderRoute();
  }
  message.success("正式工单已创建");
}

function openTaskItem(item) {
  if (item.type === "lead") {
    activeLead.value = item.data;
    leadEditForm.value = {
      issueType: item.data.issueType || issueTypes[0],
      issueDescription: item.data.issueDescription || "",
      locationDescription: item.data.locationDescription || "",
      healthStatus: item.data.healthStatus || "problem",
    };
    showTaskLeadDrawer.value = true;
    return;
  }

  navigateToOrder(item.data);
}

function navigateToOrder(order) {
  const tree = treeById(order.treeId);
  activeOrder.value = order;
  mobileNavigationOrder.value = order;
  showInspectPanel.value = false;
  isPickingInspectPosition.value = false;
  clearOrderRoute();
  if (tree) {
    setSelectedTree(tree);
  }
  router.push("/mobile/map");
  message.success(tree ? `已在地图定位 ${tree.code}` : "已进入地图导航");
  if (currentLocation.value) {
    planOrderRoute();
  }
}

function clearMobileNavigationOrder() {
  mobileNavigationOrder.value = null;
  navigationCardCollapsed.value = true;
  setSelectedTree(null);
  clearOrderRoute();
}

function focusNavigationTree() {
  const tree = mobileNavigationTree.value;
  const map = mobileMapRef.value;
  if (!tree || !map) return;
  const statusType = role.value === "maintenance" ? "processing" : "reviewing";
  map.flyTo(tree.latitude, tree.longitude, 18);
  map.showTargetMarker(tree.latitude, tree.longitude, statusType, tree.dbh);
}

function getDeviceLocation(onSuccess) {
  if (!navigator.geolocation) {
    message.warning("您的浏览器不支持地理定位");
    return;
  }
  isLocating.value = true;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      isLocating.value = false;
      onSuccess(pos.coords);
    },
    (error) => {
      isLocating.value = false;
      if (error.code === 1) {
        message.error("定位权限被拒绝，请在浏览器设置中允许定位");
      } else {
        message.error("获取定位失败，请稍后重试");
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
}

function locateCurrentPosition() {
  getDeviceLocation(({ latitude, longitude }) => {
    currentLocation.value = { lat: latitude, lng: longitude };
    message.success("已定位当前位置");
    planOrderRoute();
  });
}

function startPickCurrentLocation() {
  isPickingLocation.value = true;
  message.info("请在地图上点击选择当前位置");
}

// ---- 问题树木选择定位 ----
function toggleInspectPanel() {
  showInspectPanel.value = !showInspectPanel.value;
  if (showInspectPanel.value) {
    inspectPanelCollapsed.value = false;
    updateInspectMapOverlays();
    if (inspectResults.value.length === 0) searchInspectTrees();
  } else {
    mobileMapRef.value?.clearCustomOverlays();
    isPickingInspectPosition.value = false;
  }
}

function updateInspectMapOverlays() {
  const map = mobileMapRef.value;
  if (!map) return;
  map.clearCustomOverlays();
  map.showLocationMarker(inspectPosition.lat, inspectPosition.lng);
  map.showRadiusCircle(inspectPosition.lat, inspectPosition.lng, inspectRadius.value);
  if (inspectResults.value.length > 0) {
    map.showNearbyHighlight(inspectResults.value);
  }
}

async function searchInspectTrees() {
  isSearchingInspect.value = true;
  try {
    inspectResults.value = await fetchNearbyTreesMock(
      trees.value, inspectPosition.lat, inspectPosition.lng, inspectRadius.value
    );
  } finally {
    isSearchingInspect.value = false;
    updateInspectMapOverlays();
  }
}

function onInspectCoordChange() {
  clearTimeout(inspectSearchDebounce);
  inspectSearchDebounce = setTimeout(() => searchInspectTrees(), 600);
}

function onInspectRadiusChange() {
  searchInspectTrees();
}

function selectInspectTree(tree) {
  inspectSelectedTree.value = tree;
}

function startPickInspectPosition() {
  isPickingInspectPosition.value = true;
  message.info("请在地图上点击选择定位点");
}

function locateInspectPosition() {
  getDeviceLocation(({ latitude, longitude }) => {
    inspectPosition.lat = latitude;
    inspectPosition.lng = longitude;
    message.success("已定位当前位置");
    searchInspectTrees();
  });
}

function openCreateOrder(tree) {
  createOrderPreTree.value = tree;
  showCreateOrderModal.value = true;
}

function clearOrderRoute() {
  orderRoutePolyline.value = [];
  orderRouteMeters.value = 0;
  orderRouteDuration.value = 0;
  orderRouteUsingAmap.value = false;
  orderRouteSource.value = "straight";
  mobileMapRef.value?.clearCustomOverlays();
}

async function planOrderRoute() {
  const tree = mobileNavigationTree.value;
  if (!tree) return;
  clearOrderRoute();

  const statusType = role.value === "maintenance" ? "processing" : "reviewing";
  const map = mobileMapRef.value;
  map?.flyTo(tree.latitude, tree.longitude, 18);
  map?.showTargetMarker(tree.latitude, tree.longitude, statusType, tree.dbh);

  if (!currentLocation.value) {
    message.info("请先定位当前位置");
    return;
  }

  map?.showLocationMarker(currentLocation.value.lat, currentLocation.value.lng);

  orderRoutePlanning.value = true;
  try {
    const result = await planTreeTaskRoute({
      origin: currentLocation.value,
      destination: tree,
      park: tree.siteId,
    });
    orderRoutePolyline.value = result.polyline;
    orderRouteMeters.value = result.totalMeters;
    orderRouteDuration.value = result.durationSeconds;
    orderRouteSource.value = result.source;
    orderRouteUsingAmap.value = result.source === "amap";
    if (result.source === "straight") {
      map?.showNavigationLine(
        currentLocation.value.lat, currentLocation.value.lng,
        tree.latitude, tree.longitude
      );
      message.info("路线规划暂不可用，已用直线示意");
    } else {
      map?.showRoutePolyline(result.polyline);
    }
    const centerLat = (Number(currentLocation.value.lat) + Number(tree.latitude)) / 2;
    const centerLng = (Number(currentLocation.value.lng) + Number(tree.longitude)) / 2;
    map?.flyTo(centerLat, centerLng, 17);
  } catch (error) {
    map?.showNavigationLine(
      currentLocation.value.lat, currentLocation.value.lng,
      tree.latitude, tree.longitude
    );
    orderRouteSource.value = "straight";
    message.warning("路线规划失败，已用直线示意");
  } finally {
    orderRoutePlanning.value = false;
  }
}

function openOrderDrawer(order = mobileNavigationOrder.value) {
  if (!order) return;
  activeOrder.value = order;
  showOrderDrawer.value = true;
}

function handleArrivalAction() {
  const order = mobileNavigationOrder.value;
  if (isKeyProtectionOrder(order)) {
    const tree = mobileNavigationTree.value;
    if (tree) openCreateOrder(tree);
    return;
  }
  openOrderDrawer(order);
}

function convertActiveLead() {
  if (!activeLead.value) return;
  convertVisitorLeadToWorkOrder({
    ...activeLead.value,
    issueType: leadEditForm.value.issueType,
    issueDescription: leadEditForm.value.issueDescription,
    locationDescription: leadEditForm.value.locationDescription,
    healthStatus: leadEditForm.value.healthStatus,
  });
  showTaskLeadDrawer.value = false;
  activeLead.value = null;
  message.success("游客线索已转为正式工单");
}

function removeActiveLead() {
  if (!activeLead.value) return;
  deleteVisitorLead(activeLead.value.id);
  showTaskLeadDrawer.value = false;
  activeLead.value = null;
  message.success("游客线索已删除");
}

function submitTreatment() {
  if (!activeOrder.value) return;
  if (!treatmentForm.value.treatmentMeasures.trim()) {
    message.error("请填写处置措施");
    return;
  }
  if (treatmentPhotos.value.length === 0) {
    message.error("提交处置必须上传照片");
    return;
  }

  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  const tree = treeById(activeOrder.value.treeId);
  if (tree && tree.healthStatus !== "warning") {
    updateTree({ ...tree, healthStatus: "warning" });
  }

  updateWorkOrder({
    ...activeOrder.value,
    status: "reviewing",
    handlerId: currentUser.value?.id,
    handlerName: currentUserName.value,
    treatmentMeasures: treatmentForm.value.treatmentMeasures,
    treatmentPhotos: toPhotoRecords(treatmentPhotos.value),
    processedAt: now,
    updatedAt: now,
  });
  showOrderDrawer.value = false;
  mobileNavigationOrder.value = null;
  message.success("处置结果已提交复核");
}

function submitReview(passed) {
  if (!activeOrder.value) return;
  if (!reviewForm.value.healthStatus) {
    message.error("请选择复核后健康状态");
    return;
  }

  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  const tree = treeById(activeOrder.value.treeId);
  if (tree && tree.healthStatus !== reviewForm.value.healthStatus) {
    updateTree({ ...tree, healthStatus: reviewForm.value.healthStatus });
  }

  updateWorkOrder({
    ...activeOrder.value,
    status: passed ? "archived" : "processing",
    reviewerId: currentUser.value?.id,
    reviewerName: currentUserName.value,
    reviewResult: passed ? "passed" : "rework",
    reviewComment: reviewForm.value.reviewComment || (passed ? "处置效果达标，归档。" : "处置效果不足，退回待处置。"),
    reviewHealthStatus: reviewForm.value.healthStatus,
    reviewedAt: now,
    archivedAt: passed ? now : activeOrder.value.archivedAt,
    updatedAt: now,
  });
  showOrderDrawer.value = false;
  mobileNavigationOrder.value = null;
  message.success(passed ? "工单已复核归档" : "工单已退回待处置");
}
</script>

<template>
  <main class="mobile-shell">
    <header class="mobile-topbar">
      <div class="mobile-brand-lockup">
        <span class="mobile-brand-mark"><Leaf :size="30" /></span>
        <div class="mobile-brand-copy">
          <strong>西安城市树木地图</strong>
          <span>Explore and Care For Xi'an Urban Forest</span>
        </div>
      </div>
      <a-tag color="green">{{ roleLabels[role] }}</a-tag>
    </header>

    <section v-show="activeTab === 'map'" class="mobile-screen mobile-map-screen">
      <div class="mobile-map-wrap">
        <ArcGISTreeMap
          ref="mobileMapRef"
          :trees="filteredTrees"
          :selected-tree="selectedTree"
          :species-colors="speciesColors"
          compact
          @tree-select="handleTreeSelect"
          @map-click="handleMapClick"
        />
      </div>

      <div class="mobile-search-panel">
        <a-auto-complete
          :options="treeSearchOptions"
          :filter-option="(input, option) => String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())"
          :placeholder="isPickingGuideAnchor ? '搜索树木，把导览位置落在它附近' : '搜索树木编号或树种'"
          allow-clear
          @select="(treeId) => handleTreeSelect(treeById(treeId))"
        >
          <template #prefix><Search :size="15" /></template>
        </a-auto-complete>
      </div>

      <button
        v-if="isInspectRole"
        type="button"
        class="mobile-inspect-fab"
        :class="{ active: showInspectPanel }"
        @click="toggleInspectPanel"
      >
        <MapPinned :size="16" />问题树木定位
      </button>

      <div v-if="isInspectRole && showInspectPanel && !mobileNavigationOrder" class="mobile-inspect-panel" :class="{ collapsed: inspectPanelCollapsed }">
        <div class="mobile-inspect-head">
          <span class="mobile-inspect-title"><MapPinned :size="17" />问题树木选择定位</span>
          <span class="mobile-inspect-head-actions">
            <button type="button" class="mobile-inspect-close" :aria-label="inspectPanelCollapsed ? '展开定位面板' : '收起定位面板'" @click="inspectPanelCollapsed = !inspectPanelCollapsed">
              <ChevronDown :size="18" :class="{ open: !inspectPanelCollapsed }" />
            </button>
            <button type="button" class="mobile-inspect-close" aria-label="关闭定位面板" @click="toggleInspectPanel"><X :size="18" /></button>
          </span>
        </div>
        <div v-show="!inspectPanelCollapsed" class="mobile-inspect-panel-body">
        <p class="mobile-inspect-hint">
          点击地图选点或修改坐标，自动搜索半径内的树木 · 当前：{{ inspectPosition.lat.toFixed(6) }}, {{ inspectPosition.lng.toFixed(6) }}
        </p>

        <div class="mobile-inspect-controls">
          <a-select
            v-model:value="inspectRadius"
            size="small"
            :options="[
              { label: '5 米', value: 5 },
              { label: '10 米', value: 10 },
              { label: '20 米', value: 20 },
              { label: '50 米', value: 50 },
            ]"
            style="width: 96px;"
            @change="onInspectRadiusChange"
          />
          <a-button size="small" :loading="isLocating" @click="locateInspectPosition">
            <Navigation :size="14" />定位
          </a-button>
          <a-button size="small" :type="isPickingInspectPosition ? 'primary' : 'default'" @click="startPickInspectPosition">
            <MapPinned :size="14" />地图选点
          </a-button>
          <a-button size="small" type="primary" :loading="isSearchingInspect" @click="searchInspectTrees">
            <Search :size="14" />搜索
          </a-button>
        </div>

        <div class="mobile-inspect-results">
          <div v-if="isSearchingInspect" class="mobile-inspect-empty"><a-spin size="small" /> 正在搜索周边树木…</div>
          <div v-else-if="inspectResults.length === 0" class="mobile-inspect-empty">该范围内未找到树木，请调整位置或半径</div>
          <template v-else>
            <button
              v-for="tree in inspectResults"
              :key="tree.id"
              type="button"
              :class="['mobile-inspect-tree-row', { active: inspectSelectedTree?.id === tree.id }]"
              @click="selectInspectTree(tree)"
            >
              <span>
                <strong>{{ tree.code }} / {{ tree.species }}</strong>
                <em>约 {{ tree.distance }}m · {{ healthLabels[tree.healthStatus] }}</em>
              </span>
              <a-tag :color="tree.healthStatus === 'healthy' ? 'green' : tree.healthStatus === 'problem' ? 'red' : 'orange'">
                {{ healthLabels[tree.healthStatus] }}
              </a-tag>
            </button>
          </template>
        </div>

        <div v-if="inspectSelectedTree" class="mobile-inspect-detail">
          <div class="mobile-card-title"><Leaf :size="16" />树木详情核验</div>
          <img
            v-if="inspectSelectedTree.photos?.[0]"
            :src="inspectSelectedTree.photos[0]"
            :alt="inspectSelectedTree.species"
            class="mobile-inspect-photo"
          />
          <div class="mobile-tree-info-grid">
            <div><span>编号</span><strong>{{ inspectSelectedTree.code }}</strong></div>
            <div><span>树种</span><strong>{{ inspectSelectedTree.species }}</strong></div>
            <div><span>位置</span><strong>{{ inspectSelectedTree.siteName || "未记录" }}</strong></div>
            <div><span>胸径</span><strong>{{ inspectSelectedTree.dbh || "未记录" }} cm</strong></div>
          </div>
          <a-button type="primary" block @click="openCreateOrder(inspectSelectedTree)">选定此树，创建工单</a-button>
        </div>
        </div>
      </div>

      <div v-else-if="isPickingGuideAnchor" class="mobile-map-picker-card">
        <div class="mobile-card-title"><MapPinned :size="17" />选择导览位置</div>
        <div class="mobile-action-row" style="margin: 0 0 10px;">
          <a-button size="small" type="primary" :loading="isLocating" @click="locateGuideAnchor">
            <Navigation :size="14" />定位
          </a-button>
          <a-button size="small" :type="isPickingGuideAnchorOnMap ? 'primary' : 'default'" @click="startPickGuideAnchor">
            <MapPinned :size="14" />地图选点
          </a-button>
        </div>
        <p>{{ isPickingGuideAnchorOnMap ? '请点击地图上的任意位置作为导览起点。' : '选择「定位」使用当前位置，或点击「地图选点」后在地图上点选，系统会按这个位置计算附近树木距离。' }}</p>
        <div class="mobile-picker-list">
          <button v-for="tree in pickerTreeOptions" :key="tree.id" type="button" @click="selectGuideAnchor(tree)">
            <strong>{{ tree.code }}</strong>
            <span>{{ tree.species }}附近 · {{ tree.siteName }}</span>
          </button>
        </div>
      </div>

      <div v-else-if="mobileNavigationOrder" class="mobile-map-guidance-card" :class="{ collapsed: navigationCardCollapsed }">
        <div class="mobile-guidance-heading">
          <div class="mobile-card-title"><Navigation :size="17" />工单导航</div>
          <button type="button" @click="navigationCardCollapsed = !navigationCardCollapsed">
            {{ navigationCardCollapsed ? '展开' : '收起' }}
          </button>
        </div>
        <template v-if="!navigationCardCollapsed">
        <div class="mobile-info-row"><span>目标树木</span><strong>{{ mobileNavigationTree?.code }} / {{ mobileNavigationTree?.species }}</strong></div>
        <div class="mobile-info-row"><span>工单编号</span><strong>{{ mobileNavigationOrder.orderNo }}</strong></div>
        <div class="mobile-info-row"><span>当前位置</span><strong>{{ currentLocationLabel }}</strong></div>
        <div class="mobile-action-row" style="margin-bottom:8px;">
          <a-button size="small" :loading="isLocating" @click="locateCurrentPosition">
            <Navigation :size="14" />定位
          </a-button>
          <a-button size="small" :type="isPickingLocation ? 'primary' : 'default'" @click="startPickCurrentLocation">
            <MapPinned :size="14" />地图选点
          </a-button>
          <a-button size="small" :loading="orderRoutePlanning" :disabled="!currentLocation" @click="planOrderRoute">
            <RouteIcon :size="14" />重新规划
          </a-button>
        </div>
        <div v-if="orderRouteMeters > 0" class="mobile-info-row">
          <span>路线</span>
          <strong>
            {{ orderRouteSource === 'gp' ? 'GP路网' : orderRouteSource === 'amap' ? '高德步行' : '步行' }}
            {{ orderRouteMeters >= 1000 ? (orderRouteMeters / 1000).toFixed(1) + 'km' : Math.round(orderRouteMeters) + 'm' }}
            · 约 {{ orderRouteDurationMinutes }} 分钟
          </strong>
        </div>
        <p v-if="isPickingLocation" style="margin:0 0 8px;font-size:12px;opacity:0.75;">点击地图任意位置作为当前位置</p>
        <div class="mobile-action-row">
          <a-button type="primary" @click="handleArrivalAction">
            {{ arrivalActionLabel }}
          </a-button>
          <a-button @click="clearMobileNavigationOrder">退出导航</a-button>
        </div>
        </template>
      </div>

      <div v-else-if="selectedTree && !treeDetailExpanded" class="mobile-tree-peek" role="status">
        <span class="mobile-tree-peek-marker"><Leaf :size="17" /></span>
        <span class="mobile-tree-peek-copy">
          <strong>{{ selectedTree.code }} / {{ selectedTree.species }}</strong>
          <em>已定位并高亮 · {{ selectedTree.siteName || "位置未记录" }}</em>
        </span>
        <button type="button" class="mobile-tree-peek-detail" @click="treeDetailExpanded = true">查看详情</button>
        <button type="button" class="mobile-tree-peek-close" aria-label="取消选择" @click="closeTreeSelection"><X :size="17" /></button>
      </div>

      <div v-else-if="selectedTree" class="mobile-tree-sheet sheet-expanded">
        <div class="mobile-sheet-toolbar">
          <strong>树木详情</strong>
          <button type="button" @click="treeDetailExpanded = false">收起</button>
          <button type="button" aria-label="关闭详情" @click="closeTreeSelection"><X :size="17" /></button>
        </div>
        <img v-if="currentTreePhoto" :src="currentTreePhoto" :alt="`${selectedTree.species}照片`" />
        <div class="mobile-sheet-body">
          <div class="mobile-sheet-title">
            <div>
              <strong>{{ selectedTree.code }} / {{ selectedTree.species }}</strong>
              <span>{{ selectedTree.siteName }} · {{ selectedTree.dbh || "未记录" }}cm</span>
            </div>
            <a-tag :color="selectedTree.healthStatus === 'healthy' ? 'green' : selectedTree.healthStatus === 'warning' ? 'gold' : 'red'">
              {{ healthLabels[selectedTree.healthStatus] }}
            </a-tag>
          </div>
          <p>{{ selectedTree.locationDescription || "暂无相对位置说明" }}</p>
          <div class="mobile-tree-info-grid">
            <div><span>树种</span><strong>{{ selectedTree.species }}</strong></div>
            <div><span>胸径</span><strong>{{ selectedTree.dbh || "未记录" }} cm</strong></div>
            <div><span>类型</span><strong>{{ selectedTree.treeType || (selectedTree.isAncient ? "古树" : "普通树木") }}</strong></div>
            <div><span>位置</span><strong>{{ selectedTree.siteName || "大兴善寺" }}</strong></div>
          </div>
          <div v-if="selectedTree.story" class="mobile-card compact">
            <div class="mobile-card-title"><BookOpen :size="15" />资料卡片</div>
            <p class="mobile-drawer-copy">{{ selectedTree.story }}</p>
          </div>
          <div v-if="isInspectRole && !archiveEditing" class="mobile-archive-edit-entry">
            <a-button type="default" block @click="startEditArchive">
              <PenLine :size="15" />编辑档案
            </a-button>
          </div>
          <div v-if="isInspectRole && archiveEditing" class="story-block mobile-archive-edit-form">
            <div class="mobile-card-title"><PenLine :size="15" />编辑树木档案</div>
            <a-form layout="vertical" class="archive-edit-form">
              <a-form-item label="树种">
                <a-input v-model:value="archiveForm.species" placeholder="例如：银杏" />
              </a-form-item>
              <a-form-item label="胸径">
                <a-input v-model:value="archiveForm.dbh" placeholder="单位 cm" />
              </a-form-item>
              <a-form-item label="资料卡片">
                <a-textarea v-model:value="archiveForm.story" :rows="3" />
              </a-form-item>
              <a-space>
                <a-button type="primary" @click="saveArchive">保存</a-button>
                <a-button @click="cancelEditArchive">取消</a-button>
              </a-space>
            </a-form>
          </div>
          <div class="mobile-tree-benefits">
            <div class="mobile-benefit-heading"><Leaf :size="15" /><strong>单树生态效益</strong></div>
            <div class="mobile-benefit-total">
              <strong>¥{{ selectedTreeBenefits.totalValueYuan }}</strong>
              <span>生态价值合计</span>
            </div>
            <div class="mobile-benefit-grid">
              <div v-for="item in selectedTreeBenefitItems" :key="item.key">
                <strong>{{ item.value }} <small>{{ item.unit }}</small></strong>
                <span>{{ item.label }}</span>
                <em>¥{{ item.valueYuan }}</em>
              </div>
            </div>
            <p v-if="selectedTreeBenefits.totalValueYuan === 0" class="mobile-benefit-empty">暂无该树测算数据，等待生态价值接口补充。</p>
          </div>
          <p v-if="selectedTree.isAncient || selectedTree.protectionLevel" class="mobile-tree-note">
            保护等级：{{ selectedTree.protectionLevel || "古树名木" }}
          </p>
          <div class="mobile-action-row">
            <a-button v-if="role === 'visitor'" type="primary" @click="goCheckIn()">
              <Camera :size="15" />去打卡
            </a-button>
            <a-button v-if="role !== 'visitor'" type="primary" @click="openCreateOrder(selectedTree)">
              <ClipboardList :size="15" />工单
            </a-button>
          </div>
        </div>
      </div>
    </section>

    <section v-if="activeTab === 'add-tree' && isInspectRole" class="mobile-screen mobile-scroll-screen">
      <MobileAddTreeSection />
    </section>

    <section v-if="activeTab === 'routes' && role === 'visitor'" class="mobile-screen mobile-routes-screen">
      <MobileRoutesSection />
    </section>

    <section v-show="activeTab === 'guide'" class="mobile-screen mobile-scroll-screen">
      <div class="mobile-section-heading">
        <h1>导览打卡</h1>
        <p>{{ guideAnchorLocation ? '根据你在地图上选定的位置计算附近树木。' : '先在地图上选择一个位置，再查看附近树木和打卡内容。' }}</p>
      </div>

      <div class="mobile-card compact">
        <div class="mobile-guide-anchor">
          <div>
            <span>导览位置</span>
            <strong>{{ guideAnchorLabel }}</strong>
          </div>
          <a-button size="small" @click="chooseGuideAnchorFromMap">
            <MapPinned :size="14" />去地图定位
          </a-button>
        </div>
      </div>

      <div class="mobile-card" :class="{ collapsed: !expandedSections.nearby }">
        <button type="button" class="mobile-card-title mobile-card-toggle" @click="toggleSection('nearby')">
          <span><Leaf :size="17" />附近树木</span>
          <em>{{ nearbyTrees.length }} 棵 <ChevronDown :size="16" :class="{ open: expandedSections.nearby }" /></em>
        </button>
        <div v-show="expandedSections.nearby" class="mobile-collapsible-body">
          <a-empty v-if="!guideAnchorLocation" description="先从地图选择导览位置" />
          <button
            v-for="tree in nearbyTrees"
            :key="tree.id"
            type="button"
            class="mobile-list-row"
            @click="() => { handleTreeSelect(tree); goTab('map'); }"
          >
            <span><strong>{{ tree.code }}</strong>{{ tree.species }} · 约 {{ tree.distanceMeters }} 米</span>
            <a-button size="small" type="primary" @click.stop="openViewTree(tree)">查看</a-button>
          </button>
        </div>
      </div>

      <div class="mobile-card" :class="{ collapsed: !expandedSections.photos }">
        <button type="button" class="mobile-card-title mobile-card-toggle" @click="toggleSection('photos')">
          <span><Camera :size="17" />照片墙</span>
          <em>{{ recentPhotos.length }} 张 <ChevronDown :size="16" :class="{ open: expandedSections.photos }" /></em>
        </button>
        <div v-show="expandedSections.photos" class="mobile-collapsible-body">
          <div class="mobile-photo-grid">
            <article v-for="photo in visiblePhotos" :key="photo.id" class="mobile-photo-card">
              <img :src="photo.photoUrl" :alt="`${photo.treeCode} 打卡照片`" />
              <div>
                <strong>{{ photo.userName }}</strong>
                <span>{{ photo.treeCode }} / {{ photo.species }}</span>
                <button type="button" @click="toggleLike(photo.id)">
                  <Heart :size="13" />{{ photo.likedBy.length }}
                </button>
              </div>
            </article>
          </div>
          <div v-if="photoPageCount > 1" class="mobile-pager" aria-label="照片墙分页">
            <button type="button" aria-label="上一页照片" @click="changePagedSection('photos', -1)"><ChevronLeft :size="18" /></button>
            <span>第 {{ photoPage + 1 }} / {{ photoPageCount }} 页</span>
            <button type="button" aria-label="下一页照片" @click="changePagedSection('photos', 1)"><ChevronRight :size="18" /></button>
          </div>
        </div>
      </div>

      <div class="mobile-card" :class="{ collapsed: !expandedSections.atlas }">
        <button type="button" class="mobile-card-title mobile-card-toggle" @click="toggleSection('atlas')">
          <span><Home :size="17" />树种图鉴</span>
          <em>{{ unlockedSpecies.length }}/{{ allSpecies.length }} <ChevronDown :size="16" :class="{ open: expandedSections.atlas }" /></em>
        </button>
        <div v-show="expandedSections.atlas" class="mobile-collapsible-body">
          <div class="mobile-atlas-grid">
            <div v-for="species in visibleSpecies" :key="species" :class="['mobile-atlas-item', { unlocked: unlockedSpecies.includes(species) }]">
              <strong>{{ species }}</strong>
              <span>{{ unlockedSpecies.includes(species) ? "已解锁" : "待打卡" }}</span>
            </div>
          </div>
          <div v-if="atlasPageCount > 1" class="mobile-pager" aria-label="树种图鉴分页">
            <button type="button" aria-label="上一页图鉴" @click="changePagedSection('atlas', -1)"><ChevronLeft :size="18" /></button>
            <span>第 {{ atlasPage + 1 }} / {{ atlasPageCount }} 页</span>
            <button type="button" aria-label="下一页图鉴" @click="changePagedSection('atlas', 1)"><ChevronRight :size="18" /></button>
          </div>
        </div>
      </div>

      <div class="mobile-card" :class="{ collapsed: !expandedSections.rank }">
        <button type="button" class="mobile-card-title mobile-card-toggle" @click="toggleSection('rank')">
          <span><CheckCircle2 :size="17" />打卡排行</span>
          <em>{{ checkInLeaderboard.length }} 棵 <ChevronDown :size="16" :class="{ open: expandedSections.rank }" /></em>
        </button>
        <div v-show="expandedSections.rank" class="mobile-collapsible-body">
          <div class="mobile-rank-list" :class="{ scrollable: checkInLeaderboard.length > 5 }">
          <div v-for="(item, index) in checkInLeaderboard" :key="item.treeId" class="mobile-rank-row">
            <strong>{{ index + 1 }}</strong>
            <span>{{ item.treeCode }} / {{ item.species }}</span>
            <em>{{ item.count }} 次</em>
          </div>
          </div>
        </div>
      </div>
    </section>

    <section v-show="activeTab === 'tasks'" class="mobile-screen mobile-scroll-screen">
      <div class="mobile-section-heading">
        <h1>现场任务</h1>
        <p>{{ roleTaskIntro }}</p>
      </div>

      <div v-for="(group, groupIndex) in taskGroups" :key="group.title" class="mobile-card" :class="{ collapsed: !isTaskGroupOpen(group.title, groupIndex) }">
        <button type="button" class="mobile-card-title mobile-card-toggle" @click="toggleTaskGroup(group.title, groupIndex)">
          <span><ListChecks :size="17" />{{ group.title }}</span>
          <em>{{ group.items.length }} 项 <ChevronDown :size="16" :class="{ open: isTaskGroupOpen(group.title, groupIndex) }" /></em>
        </button>
        <div v-show="isTaskGroupOpen(group.title, groupIndex)" class="mobile-collapsible-body">
          <p class="mobile-group-description">{{ group.description }}</p>
          <a-empty v-if="group.items.length === 0" :description="group.empty" />
          <div
            v-for="item in group.items"
            :key="`${item.type}-${item.data.id}`"
            role="button"
            tabindex="0"
            class="mobile-task-card"
            @click="openTaskItem(item)"
            @keydown.enter.prevent="openTaskItem(item)"
            @keydown.space.prevent="openTaskItem(item)"
          >
            <span class="mobile-task-top">
              <strong>{{ item.data.orderNo || item.data.leadNo }}</strong>
              <a-tag v-if="item.type === 'order'" :color="statusColor[item.data.status]">{{ statusLabels[item.data.status] }}</a-tag>
              <a-tag v-else :color="leadStatusColor[item.data.status]">{{ leadStatusLabels[item.data.status] }}</a-tag>
            </span>
            <span>{{ treeById(item.data.treeId)?.code || item.data.treeId }} / {{ treeById(item.data.treeId)?.species || "树木" }}</span>
            <span>{{ item.data.issueType }} · {{ item.data.creatorName || item.data.submitterName || "游客" }}</span>
            <button
              v-if="item.type === 'order'"
              type="button"
              class="mobile-task-action"
              @click.stop="openTaskItem(item)"
            >
              <Navigation :size="12" />{{ orderTaskActionLabel(item.data) }}
            </button>
            <em>{{ item.data.updatedAt || item.data.createdAt }}</em>
          </div>
        </div>
      </div>
    </section>

    <section v-show="activeTab === 'me'" class="mobile-screen mobile-scroll-screen">
      <div class="mobile-profile-card">
        <div class="mobile-avatar"><UserRound :size="30" /></div>
        <strong>{{ currentUserName }}</strong>
        <span>{{ roleLabels[role] }} · {{ organizationName }}</span>
      </div>

      <div class="mobile-metric-grid">
        <div v-for="metric in profileMetrics" :key="metric.label">
          <strong>{{ metric.value }}</strong>
          <span>{{ metric.label }}</span>
        </div>
      </div>

      <div class="mobile-card">
        <div class="mobile-info-row"><span>登录账号</span><strong>{{ currentUser?.account }}</strong></div>
        <div class="mobile-info-row"><span>用户名</span><strong>{{ currentUserName }}</strong></div>
        <div class="mobile-info-row"><span>审核状态</span><strong>{{ currentUser?.approvalStatus === 'pending' ? '待审核' : '已通过' }}</strong></div>
      </div>

      <a-button danger block size="large" @click="handleLogout">退出登录</a-button>
    </section>

    <nav class="mobile-tabbar" :style="{ gridTemplateColumns: `repeat(${tabItems.length}, minmax(0, 1fr))` }">
      <button
        v-for="item in tabItems"
        :key="item.key"
        type="button"
        :class="{ active: activeTab === item.key }"
        @click="goTab(item.key)"
      >
        <component :is="item.icon" :size="19" />
        <span>{{ item.label }}</span>
      </button>
    </nav>

    <a-drawer
      :open="showLeadDrawer"
      placement="bottom"
      height="82vh"
      title="提交游客线索"
      class="mobile-bottom-drawer"
      @close="showLeadDrawer = false"
    >
      <a-form layout="vertical">
        <a-form-item label="问题类型" required>
          <a-select v-model:value="leadForm.issueType" :options="issueTypes.map((type) => ({ label: type, value: type }))" />
        </a-form-item>
        <a-form-item label="问题描述" required>
          <a-textarea v-model:value="leadForm.issueDescription" :rows="4" placeholder="描述现场问题、位置和判断" />
        </a-form-item>
        <a-form-item label="相对位置">
          <a-input v-model:value="leadForm.locationDescription" />
        </a-form-item>
        <a-form-item label="现场照片" required>
          <a-upload v-model:file-list="leadPhotos" :before-upload="() => false" :max-count="3" list-type="picture">
            <a-button><Camera :size="15" />添加照片</a-button>
          </a-upload>
        </a-form-item>
        <a-button type="primary" block size="large" @click="submitLead">提交线索</a-button>
      </a-form>
    </a-drawer>

    <a-drawer
      :open="showTaskLeadDrawer"
      placement="bottom"
      height="86vh"
      title="游客线索"
      class="mobile-bottom-drawer"
      @close="showTaskLeadDrawer = false"
    >
      <a-space v-if="activeLead" direction="vertical" class="full-width" :size="14">
        <a-tag :color="leadStatusColor[activeLead.status]">{{ leadStatusLabels[activeLead.status] }}</a-tag>
        <p class="mobile-drawer-copy">{{ activeLead.issueDescription }}</p>
        <a-form layout="vertical">
          <a-form-item label="问题类型">
            <a-select v-model:value="leadEditForm.issueType" :options="issueTypes.map((type) => ({ label: type, value: type }))" />
          </a-form-item>
          <a-form-item label="问题描述">
            <a-textarea v-model:value="leadEditForm.issueDescription" :rows="3" />
          </a-form-item>
          <a-form-item label="相对位置">
            <a-input v-model:value="leadEditForm.locationDescription" />
          </a-form-item>
          <a-form-item label="健康状态">
            <a-select v-model:value="leadEditForm.healthStatus" :options="healthOptions" />
          </a-form-item>
        </a-form>
        <div v-if="activeLead.photos?.length" class="mobile-drawer-photos">
          <img v-for="photo in activeLead.photos" :key="photo.uid" :src="photo.url" :alt="photo.name" />
        </div>
        <a-space v-if="role === 'inspector'" class="full-width">
          <a-button type="primary" block :disabled="activeLead.status !== 'new'" @click="convertActiveLead">转工单</a-button>
          <a-button danger @click="removeActiveLead">删除</a-button>
        </a-space>
      </a-space>
    </a-drawer>

    <a-drawer
      :open="showOrderDrawer"
      placement="bottom"
      height="90vh"
      title="现场工单"
      class="mobile-bottom-drawer"
      @close="showOrderDrawer = false"
    >
      <a-space v-if="activeOrder" direction="vertical" class="full-width" :size="14">
        <a-tag :color="statusColor[activeOrder.status]">{{ statusLabels[activeOrder.status] }}</a-tag>
        <div class="mobile-card compact">
          <div class="mobile-info-row"><span>工单编号</span><strong>{{ activeOrder.orderNo }}</strong></div>
          <div class="mobile-info-row"><span>目标树木</span><strong>{{ orderTree?.code }} / {{ orderTree?.species }}</strong></div>
          <div class="mobile-info-row"><span>创建人</span><strong>{{ activeOrder.creatorName }}</strong></div>
          <div class="mobile-info-row"><span>处置人</span><strong>{{ activeOrder.handlerName || "未处置" }}</strong></div>
          <div class="mobile-info-row"><span>复核人</span><strong>{{ activeOrder.reviewerName || "未复核" }}</strong></div>
        </div>
        <p class="mobile-drawer-copy">{{ activeOrder.issueDescription }}</p>

        <div v-if="role === 'maintenance' && activeOrder.status === 'processing'" class="mobile-card compact">
          <div class="mobile-card-title"><Wrench :size="17" />处置反馈</div>
          <a-form layout="vertical" :model="treatmentForm" @finish="submitTreatment">
            <a-form-item label="处置措施" required>
              <a-textarea v-model:value="treatmentForm.treatmentMeasures" :rows="4" />
            </a-form-item>
            <a-form-item label="处置照片" required>
              <a-upload v-model:file-list="treatmentPhotos" :before-upload="() => false" :max-count="4" list-type="picture">
                <a-button><Camera :size="15" />添加照片</a-button>
              </a-upload>
            </a-form-item>
            <a-button type="primary" block size="large" html-type="submit">提交复核</a-button>
          </a-form>
        </div>

        <div v-if="role === 'inspector' && activeOrder.status === 'reviewing'" class="mobile-card compact">
          <div class="mobile-card-title"><CheckCircle2 :size="17" />复核处理</div>
          <a-form layout="vertical">
            <a-form-item label="复核后健康状态" required>
              <a-select v-model:value="reviewForm.healthStatus" :options="healthOptions" />
            </a-form-item>
            <a-form-item label="复核意见">
              <a-textarea v-model:value="reviewForm.reviewComment" :rows="3" />
            </a-form-item>
            <a-space direction="vertical" class="full-width">
              <a-button type="primary" block size="large" @click="submitReview(true)">通过并归档</a-button>
              <a-button danger block @click="submitReview(false)">退回待处置</a-button>
            </a-space>
          </a-form>
        </div>
      </a-space>
    </a-drawer>

    <a-drawer
      :open="showViewTreeDrawer"
      placement="bottom"
      height="88vh"
      title="树木详情"
      class="mobile-bottom-drawer"
      @close="closeViewTree"
    >
      <a-space v-if="viewingTree" direction="vertical" class="full-width" :size="14">
        <img
          v-if="viewingTree.photos?.[0]"
          :src="viewingTree.photos[0]"
          :alt="viewingTree.species"
          class="mobile-view-tree-photo"
        />
        <div class="mobile-card compact">
          <div class="mobile-info-row"><span>编号</span><strong>{{ viewingTree.code }}</strong></div>
          <div class="mobile-info-row"><span>树种</span><strong>{{ viewingTree.species }}</strong></div>
          <div class="mobile-info-row"><span>位置</span><strong>{{ viewingTree.siteName }}</strong></div>
          <div class="mobile-info-row"><span>胸径</span><strong>{{ viewingTree.dbh ? viewingTree.dbh + ' cm' : '未记录' }}</strong></div>
          <div class="mobile-info-row"><span>坐标</span><strong>{{ viewingTree.longitude?.toFixed(6) }}, {{ viewingTree.latitude?.toFixed(6) }}</strong></div>
          <div class="mobile-info-row"><span>类型</span><strong>{{ viewingTree.treeType || '普通树木' }}</strong></div>
          <div class="mobile-info-row"><span>保护等级</span><strong>{{ viewingTree.protectionLevel || '无' }}</strong></div>
        </div>
        <div class="mobile-tree-benefits mobile-drawer-benefits">
          <div class="mobile-benefit-heading"><Leaf :size="15" /><strong>单树生态效益</strong></div>
          <div class="mobile-benefit-total">
            <strong>¥{{ viewingTreeBenefits.totalValueYuan }}</strong>
            <span>生态价值合计</span>
          </div>
          <div class="mobile-benefit-grid">
            <div v-for="item in viewingTreeBenefitItems" :key="item.key">
              <strong>{{ item.value }} <small>{{ item.unit }}</small></strong>
              <span>{{ item.label }}</span>
              <em>¥{{ item.valueYuan }}</em>
            </div>
          </div>
          <p v-if="viewingTreeBenefits.totalValueYuan === 0" class="mobile-benefit-empty">暂无该树测算数据，等待生态价值接口补充。</p>
        </div>
        <div v-if="viewingTree.story" class="mobile-card compact">
          <div class="mobile-card-title"><BookOpen :size="15" />资料卡片</div>
          <p class="mobile-drawer-copy">{{ viewingTree.story }}</p>
        </div>
        <input
          ref="viewTreeCameraInput"
          type="file"
          capture="environment"
          accept="image/*"
          style="display: none"
          @change="onViewTreeCameraCapture"
        />
        <div class="mobile-action-row">
          <a-button type="primary" size="large" @click="triggerViewTreeCamera">
            <Camera :size="18" />拍照打卡
          </a-button>
          <a-button size="large" @click="openLeadFromViewTree">
            <Send :size="18" />线索
          </a-button>
        </div>
        <p class="mobile-view-tree-hint">拍照后自动发布至照片墙，并解锁该树种图鉴</p>
      </a-space>
    </a-drawer>

    <CreateWorkOrderModal
      :open="showCreateOrderModal"
      :trees="trees"
      :role="role"
      :current-user="currentUser"
      :current-user-name="currentUserName"
      :pre-selected-tree="createOrderPreTree"
      @close="showCreateOrderModal = false"
      @create-order="handleCreateOrder"
      @update-tree="updateTree"
    />
  </main>
</template>
