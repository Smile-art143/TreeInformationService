<script setup>
import { inject } from "vue";
import RoutesSection from "../components/RoutesSection.vue";

const { trees, focusTree } = inject("appState");
</script>

<template>
  <RoutesSection :trees="trees" @focus-tree="focusTree" />
</template>
