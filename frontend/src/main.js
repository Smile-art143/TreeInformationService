import { createApp } from "vue";
import Antd from "ant-design-vue";
import "@arcgis/core/assets/esri/themes/light/main.css";
import "ant-design-vue/dist/reset.css";
import "./styles.css";
import App from "./App.vue";
import router from "./router";

const app = createApp(App);
app.use(Antd);
app.use(router);
app.mount("#app");
