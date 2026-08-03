<script setup>
import { inject } from "vue";
import WorkbenchPanel from "../components/WorkbenchPanel.vue";

const { role, workOrders, selectedOrder, setSelectedOrder, updateWorkOrder } = inject("appState");
</script>

<template>
  <WorkbenchPanel
    :role="role"
    :work-orders="workOrders"
    :selected-order="selectedOrder"
    @select-order="setSelectedOrder"
    @update-order="updateWorkOrder"
  />
</template>
