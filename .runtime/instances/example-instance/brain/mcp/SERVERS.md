# MCP Servers Configuration

This folder contains MCP (Model Context Protocol) server configurations.

## Format

Each server is defined as a JSON file:

```json
{
  "name": "filesystem",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed"],
  "enabled": true
}
```

## Available MCP Servers

### Filesystem
```bash
npx -y @modelcontextprotocol/server-filesystem /allowed/path
```

### GitHub
```bash
npx -y @modelcontextprotocol/server-github
```

### Postgres
```bash
npx -y @modelcontextprotocol/server-postgres postgres://user:pass@localhost/db
```

## Adding a Server

1. Create a JSON file in this folder
2. Add the server configuration
3. Restart the agent

## Security

- Only enable servers you need
- Restrict filesystem access to necessary paths
- Don't expose credentials in config files
