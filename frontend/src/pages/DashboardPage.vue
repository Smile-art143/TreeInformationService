<script setup>
import { inject } from "vue";
import StatsPanel from "../components/StatsPanel.vue";

const { stats } = inject("appState");
</script>

<template>
  <StatsPanel :stats="stats" />
</template>
