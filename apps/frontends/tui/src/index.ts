import { ClogApiClient, resolveBackendBaseUrl } from "./clog-api";
import { startTui } from "./tui";

export const startTuiFrontend = async (): Promise<void> => {
  const client = new ClogApiClient({ baseUrl: resolveBackendBaseUrl() });
  await startTui(client);
};

if (import.meta.main) {
  await startTuiFrontend();
}
