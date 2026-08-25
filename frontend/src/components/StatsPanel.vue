<script setup>
import { computed } from "vue";
import VChart from "vue-echarts";
import { use } from "echarts/core";
import { PieChart, BarChart } from "echarts/charts";
import { TooltipComponent, GridComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { BarChart3, Leaf, Sprout, Waves } from "lucide-vue-next";
import { otherSpeciesColor } from "../api/mockApi";

use([PieChart, BarChart, TooltipComponent, GridComponent, CanvasRenderer]);

const props = defineProps({
  stats: { type: Object, required: true },
});

const TOP_SPECIES_COUNT = 7;

const speciesOption = computed(() => {
  const ratio = props.stats.speciesRatio ?? [];
  const data = ratio.slice(0, TOP_SPECIES_COUNT).map((item) => ({
    name: item.species,
    value: item.count,
  }));
  const otherCount = ratio
    .slice(TOP_SPECIES_COUNT)
    .reduce((sum, item) => sum + item.count, 0);

  if (otherCount > 0) {
    data.push({
      name: "其他树种",
      value: otherCount,
      itemStyle: { color: otherSpeciesColor },
    });
  }

  return {
    tooltip: { trigger: "item" },
    series: [
      {
        type: "pie",
        radius: ["44%", "70%"],
        data,
      },
    ],
  };
});

const dbhOption = {
  tooltip: { trigger: "axis" },
  xAxis: { type: "category", data: props.stats.dbhDistribution.map((item) => item.range) },
  yAxis: { type: "value" },
  grid: { left: 34, right: 14, top: 22, bottom: 28 },
  series: [
    {
      type: "bar",
      data: props.stats.dbhDistribution.map((item) => item.count),
      itemStyle: { color: "#4B7F52" },
    },
  ],
};
</script>

<template>
  <div class="stats-page">
    <div class="page-heading">
      <div>
        <h1>树木统计看板</h1>
        <p>汇总树木数量、树种构成、胸径分布和生态效益指标。</p>
      </div>
    </div>

    <a-row :gutter="[16, 16]">
      <a-col :xs="24" :lg="12">
        <a-card title="树种构成" :bordered="false">
          <VChart :option="speciesOption" style="height: 300px" autoresize />
        </a-card>
      </a-col>
      <a-col :xs="24" :lg="12">
        <a-card title="胸径分布" :bordered="false">
          <VChart :option="dbhOption" style="height: 300px" autoresize />
        </a-card>
      </a-col>
      
    </a-row>
  </div>
</template>
