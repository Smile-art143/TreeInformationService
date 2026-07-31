<script setup>
import VChart from "vue-echarts";
import { use } from "echarts/core";
import { PieChart, BarChart } from "echarts/charts";
import { TooltipComponent, GridComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { BarChart3, Leaf, Sprout, Waves } from "lucide-vue-next";

use([PieChart, BarChart, TooltipComponent, GridComponent, CanvasRenderer]);

const props = defineProps({
  stats: { type: Object, required: true },
});

const speciesOption = {
  tooltip: { trigger: "item" },
  series: [
    {
      type: "pie",
      radius: ["44%", "70%"],
      data: props.stats.speciesRatio.slice(0, 8).map((item) => ({
        name: item.species,
        value: item.count,
      })),
    },
  ],
};

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
      <a-col :xs="24" :md="8">
        <a-card :bordered="false">
          <a-statistic title="树木总数" :value="stats.totalTrees" suffix="棵">
            <template #prefix><Leaf :size="22" /></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :xs="24" :md="8">
        <a-card :bordered="false">
          <a-statistic title="树种数量" :value="stats.speciesCount" suffix="类">
            <template #prefix><Sprout :size="22" /></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :xs="24" :md="8">
        <a-card :bordered="false">
          <a-statistic title="年雨水截留估算" :value="stats.ecologicalBenefits.stormwaterIntercepted" suffix="L">
            <template #prefix><Waves :size="22" /></template>
          </a-statistic>
        </a-card>
      </a-col>
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
      <a-col :xs="24">
        <a-card title="生态效益估算" :bordered="false">
          <a-row :gutter="[16, 16]">
            <a-col :xs="12" :md="6">
              <a-statistic title="碳储存" :value="stats.ecologicalBenefits.carbonStorage" suffix="kg" />
            </a-col>
            <a-col :xs="12" :md="6">
              <a-statistic title="年固碳" :value="stats.ecologicalBenefits.carbonSequestration" suffix="kg" />
            </a-col>
            <a-col :xs="12" :md="6">
              <a-statistic title="年产氧" :value="stats.ecologicalBenefits.oxygenProduction" suffix="kg" />
            </a-col>
            <a-col :xs="12" :md="6">
              <a-statistic title="空气污染物移除" :value="stats.ecologicalBenefits.airPollutionRemoved" suffix="kg">
                <template #prefix><BarChart3 :size="18" /></template>
              </a-statistic>
            </a-col>
          </a-row>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>
