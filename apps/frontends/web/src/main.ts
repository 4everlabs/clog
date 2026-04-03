import { mount } from "svelte";
import App from "./App.svelte";

const target = document.getElementById("app");

if (!target) {
  throw new Error("App mount target was not found");
}

mount(App, {
  target,
  props: {
    baseUrl: import.meta.env.VITE_CLOG_BACKEND_URL?.trim() || undefined,
  },
});
