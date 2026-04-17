# Runtime Setup

Use this flow to bring the Bun runtime, PostHog tooling, and service process up on a Debian or Ubuntu machine.

## 1. Install prerequisites

Install the required tooling on the host before you start:

- Bun
- `gh`
- `@posthog/cli` if you plan to use the endpoint or sourcemap workflows

## 2. Clone and install the app

```bash
git clone <your-repo-url> /opt/clog
cd /opt/clog
bun install --frozen-lockfile
```

## 3. Configure the runtime

Copy [`.env.example`](../.env.example) to `/etc/clog.env` or local `.env` and fill in the real values:

- PostHog host, project ID, and personal API key
- optional PostHog project API key if the service should emit its own events
- optional insight monitor HogQL queries
- Telegram and any other integration secrets you need outside the PostHog rollout

The repo keeps `example-instance` as a clean starter shape. Local development writes to `personal-instance`, which is ignored by git so your personal runtime state does not dirty the starter instance. App-owned prompts and knowledge live in `apps/clog/src/brain`, while each instance keeps `read-only/settings.json`, `read-only/tools.json`, `wakeup.json`, `storage/state/*.json`, and `workspace/`. `read-only/settings.json` is where you pin runtime-only context such as the active PostHog workspace so the model does not need to discover it through tools. Runtime bootstrap now fills in missing starter files from `example-instance` so you do not have to copy new files by hand. Secrets still stay in `.env` for now rather than in tracked instance JSON files.

## 4. Install the service unit

Copy [`docs/clog.service`](docs/clog.service) to `/etc/systemd/system/clog.service`, then reload and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable clog
sudo systemctl start clog
sudo systemctl status clog
```

## 5. Smoke check the runtime

```bash
bun run dev

curl http://127.0.0.1:6900/healthz
curl http://127.0.0.1:6900/api/bootstrap
curl http://127.0.0.1:6900/api/posthog/errors
```

## Notes

- Keep `/etc/clog.env` owned by the service user or root and not world-readable.
- `posthog-cli` is only needed for endpoints and sourcemap workflows. The monitoring path uses the PostHog API directly.
- PostHog MCP belongs on your coding machine, not as a required runtime dependency.
