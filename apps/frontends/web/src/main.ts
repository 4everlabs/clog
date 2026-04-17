import { mount } from "svelte";
import App from "./App.svelte";

const target = document.getElementById("app");

if (!target) {
  throw new Error("App mount target was not found");
}

function parseSessionStartedAt(search: string): number | null {
  const value = new URLSearchParams(search).get("sessionStartedAt")?.trim();
  if (!value) {
    return null;
  }

  const numericTimestamp = Number(value);
  if (Number.isFinite(numericTimestamp) && numericTimestamp >= 0) {
    return numericTimestamp;
  }

  const parsedTimestamp = Date.parse(value);
  return Number.isFinite(parsedTimestamp) && parsedTimestamp >= 0 ? parsedTimestamp : null;
}

mount(App, {
  target,
  props: {
    baseUrl: import.meta.env.VITE_CLOG_BACKEND_URL?.trim() || undefined,
    sessionStartedAt: parseSessionStartedAt(window.location.search),
  },
});
