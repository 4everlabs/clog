import { ClogApiClient, resolveBackendBaseUrl } from "./clog-api";
import { startCli } from "./cli";

export const startCliFrontend = async (): Promise<void> => {
  const client = new ClogApiClient({ baseUrl: resolveBackendBaseUrl() });
  await startCli(client);
};

if (import.meta.main) {
  await startCliFrontend();
}
