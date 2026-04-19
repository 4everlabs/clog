# GCE Clean Bundle Deploy

Use this flow when you want to deploy `clog` to a Google Compute Engine Ubuntu VM without shipping your local runtime state.

## What the bundle includes

The clean bundle is created from the current working tree and includes:

- application source files
- workspace `package.json` files
- `bun.lock`
- `.runtime/instances/00/`

It excludes:

- `.env` and local `.env.*.local` files
- `.git`
- `node_modules`
- `dist`
- `out`
- `.runtime/instances/personal-instance/`
- any runtime instance other than `00`
- directories named `logs/` anywhere in the tree, including legacy `storage/logs/`

Within the tracked starter instance `00`, the bundle still includes tracked runtime files under `storage/` such as `storage/state/`, `storage/conversations/`, and any tracked `storage/sessions/<utc-timestamp>/system.log` examples.

Create it with:

```bash
bun run bundle:gce
```

The command writes:

- `out/clog-gce-bundle-<timestamp>.tgz`
- `out/clog-gce-bundle-<timestamp>.tgz.manifest.txt`

## Google side setup

From your Mac, prefer `gcloud` over manual key downloads.

1. Install the Google Cloud CLI.

```bash
brew install --cask gcloud-cli
```

2. Authenticate and choose the project.

```bash
gcloud auth login
gcloud config set project <project-id>
```

3. Verify SSH access.

```bash
gcloud compute ssh <vm-name> --zone <zone>
```

Notes:

- `gcloud compute ssh` creates the local SSH key for you if needed.
- If your project uses OS Login, your Google account needs `roles/compute.osAdminLogin` or equivalent access.
- If the command asks you to re-authenticate, do that before attempting file transfer.

## Upload and extract the bundle

Copy the generated archive to the VM:

```bash
gcloud compute scp "out/clog-gce-bundle-<timestamp>.tgz" <vm-name>:~/ --zone <zone>
```

Then SSH in and unpack it:

```bash
sudo mkdir -p /opt/clog
sudo chown "$USER":"$USER" /opt/clog
tar -xzf "$HOME/clog-gce-bundle-<timestamp>.tgz" -C /opt/clog
cd /opt/clog
```

## Install Bun and dependencies on Ubuntu

```bash
sudo apt update
sudo apt install -y git curl unzip
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

cd /opt/clog
bun install --frozen-lockfile
```

## Create the runtime env file

Use a fresh instance id so the VM seeds itself from the tracked starter instance `00`:

```bash
sudo tee /etc/clog.env >/dev/null <<'EOF'
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_BOT_USERNAME=your-bot-username
TELEGRAM_ALLOWED_CHATS=123456789
OPENROUTER_API_KEY=sk-or-...
CLOG_MODEL=google/gemma-4-31b-it:free
CLOG_INSTANCE_ID=gce-instance
EOF
```

Add PostHog and Notion keys only if you want those integrations active on the VM.

## Smoke test

```bash
cd /opt/clog
set -a
source /etc/clog.env
set +a

bun run runtime
```

You want logs that show the runtime is ready and Telegram polling is enabled.

## Install the system service

Use [`docs/clog.service`](./clog.service) as the base template. Update:

- `User`
- `Group`
- `ExecStart`

Then install it:

```bash
sudo cp docs/clog.service /etc/systemd/system/clog.service
sudo systemctl daemon-reload
sudo systemctl enable --now clog
sudo systemctl status clog
sudo journalctl -u clog -f
```

## Important runtime note

This Telegram adapter uses long polling. Only one live process should poll with the same bot token at a time. Stop local bot sessions before leaving the VM service running.
