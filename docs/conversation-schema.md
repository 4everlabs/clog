# Conversation JSONL Schema

## File Location
```
.conversations/{channel}/{thread_id}.jsonl
```

Examples:
```
.conversations/telegram/123456.jsonl
.conversations/cli/local.jsonl
.conversations/web/session-abc123.jsonl
```

## Message Format (JSONL - one JSON object per line)

```json
{
  "id": "msg_abc123def456",
  "role": "user",
  "content": "what errors happened today?",
  "timestamp": 1709500000000,
  "tool_calls": [
    {
      "name": "posthog_list_errors",
      "args": {"lookbackMinutes": 60},
      "result": "..."
    }
  ],
  "metadata": {
    "chat_id": 123456,
    "channel": "telegram",
    "reply_to": "msg_xyz789"
  }
}
```

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique message ID (ulid or uuid) |
| `role` | string | yes | `user`, `agent`, `system`, `tool` |
| `content` | string | yes | Message text |
| `timestamp` | number | yes | Unix ms timestamp (for ordering) |
| `tool_calls` | array | no | Tool invocations in this message |
| `metadata` | object | no | Channel-specific data |

## Roles

- `system` - System prompts (first message)
- `user` - Human messages
- `agent` - AI responses
- `tool` - Tool results (returned to model)

## Example Conversation

```jsonl
{"id":"msg_01","role":"system","content":"You are Clog...","timestamp":1709500000000}
{"id":"msg_02","role":"user","content":"show me errors","timestamp":1709500001000}
{"id":"msg_03","role":"agent","content":"Let me check...","timestamp":1709500002000,"tool_calls":[{"name":"posthog_list_errors","args":{},"result":"..."}]}
{"id":"msg_04","role":"tool","content":"[errors array]","timestamp":1709500002500,"metadata":{"tool_call_id":"msg_03"}}
{"id":"msg_05","role":"agent","content":"Found 12 errors in the last hour.","timestamp":1709500003000}
```

## Ordering

Messages are ordered by `timestamp` ascending (oldest first) - same order you'd send to the LLM.

## Thread Metadata (separate file)

```json
// .conversations/telegram/123456.meta.json
{
  "thread_id": "123456",
  "channel": "telegram",
  "created_at": 1709450000000,
  "updated_at": 1709500003000,
  "title": "Error investigation",
  "participants": ["user_123", "clog"]
}
```
