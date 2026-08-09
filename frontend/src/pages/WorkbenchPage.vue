<script setup>
import { inject } from "vue";
import WorkbenchPanel from "../components/WorkbenchPanel.vue";

const {
  role,
  trees,
  workOrders,
  visitorLeads,
  selectedOrder,
  setSelectedOrder,
  updateWorkOrder,
  createWorkOrder,
  deleteVisitorLead,
  convertVisitorLeadToWorkOrder,
  updateTree,
} = inject("appState");
</script>

<template>
  <WorkbenchPanel
    :role="role"
    :trees="trees"
    :work-orders="workOrders"
    :visitor-leads="visitorLeads"
    :selected-order="selectedOrder"
    @select-order="setSelectedOrder"
    @update-order="updateWorkOrder"
    @create-order="createWorkOrder"
    @convert-lead="convertVisitorLeadToWorkOrder"
    @delete-lead="deleteVisitorLead"
    @update-tree="updateTree"
  />
</template>
