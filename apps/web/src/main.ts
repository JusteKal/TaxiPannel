// latin-* and not the bare weight files: those also pull the devanagari
// subsets, which is ~370 kB of fonts this app has no use for.
import "@fontsource/poppins/latin-400.css";
import "@fontsource/poppins/latin-500.css";
import "@fontsource/poppins/latin-600.css";
import "@fontsource/poppins/latin-700.css";
import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
import "./styles/index.css";

createApp(App).use(router).mount("#app");
