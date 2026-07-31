<script setup>
import { inject } from "vue";
import GuideSection from "../components/GuideSection.vue";

const { trees, focusTree } = inject("appState");
</script>

<template>
  <GuideSection :trees="trees" @focus-tree="focusTree" />
</template>
