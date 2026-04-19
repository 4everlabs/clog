# Runtime Setup

Use this flow to bring the Bun runtime, PostHog tooling, and service process up on a Debian or Ubuntu machine.

## 1. Install prerequisites

Install the required tooling on the host before you start:

- Bun
- `gh`
- `@posthog/cli` if you plan to use the endpoint or sourcemap workflows

## 2. Get the app onto the host

```bash
git clone <your-repo-url> /opt/clog
cd /opt/clog
bun install --frozen-lockfile
```

For Google Compute Engine, prefer the clean bundle flow in [`docs/gce-clean-bundle.md`](gce-clean-bundle.md) when you want to ship source plus the tracked starter instance `00` but exclude your local `personal-instance`.

## 3. Configure the runtime

Copy [`.env.example`](../.env.example) to `/etc/clog.env` or local `.env` and fill in the real values:

- PostHog host, project ID, and personal API key
- Convex deployment URL and optional auth token if your read-only queries require user auth
- optional PostHog project API key if the service should emit its own events
- optional insight monitor HogQL queries
- Telegram and any other integration secrets you need outside the PostHog rollout

The repo keeps the tracked starter instance under `.runtime/instances/00`. Local development writes to `personal-instance`, which is ignored by git so your personal runtime state does not dirty the starter instance. App-owned prompts and knowledge live in `apps/clog/src/ai/brain`, while each instance keeps `read-only/settings.json`, `read-only/tools.json`, `read-only/wakeup.json`, `storage/state/*.json`, and `workspace/`. `read-only/settings.json` is where you pin runtime-only context such as the active PostHog workspace so the runtime can scope tool exposure without showing the model a big discovery workflow. Runtime bootstrap now fills in missing starter files from the tracked starter instance so you do not have to copy new files by hand. Set `CLOG_INSTANCE_ID` to a fresh value on a new host when you want it to seed a clean instance from that tracked starter. Secrets still stay in `.env` for now rather than in tracked instance JSON files.

Starter `read-only/wakeup.json`:

```json
{
  "enabled": true,
  "prompts": {
    "checkIn": {
      "title": "Check in",
      "prompt": "Check in."
    }
  },
  "schedule": [
    {
      "promptId": "checkIn",
      "timeUtc": "10:00"
    }
  ]
}
```

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
bun run runtime

curl http://127.0.0.1:6900/healthz
curl http://127.0.0.1:6900/api/bootstrap
curl http://127.0.0.1:6900/api/posthog/errors
```

## Notes

- Keep `/etc/clog.env` owned by the service user or root and not world-readable.
- Convex access is intentionally read-only in `clog`: it calls Convex query functions over the official `/api/query` HTTP endpoint.
- `posthog-cli` is only needed for endpoints and sourcemap workflows. The monitoring path uses the PostHog API directly.
- PostHog MCP belongs on your coding machine, not as a required runtime dependency.
