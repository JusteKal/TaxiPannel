import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import BuilderView from "../views/BuilderView.vue";

const routes: RouteRecordRaw[] = [
  { path: "/", name: "builder", component: BuilderView },
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});
