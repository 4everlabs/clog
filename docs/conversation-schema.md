# Conversation Storage Schema

## File Location

Each conversation lives in its own folder under `storage/conversations/`.

```text
storage/conversations/conversation-2026-03-26T01-32-20-418Z-thread_abc123/
  notes.jsonl
  chat.jsonl
```

Notes:

- Folder names are timestamp-first so they are easy to scan in the filesystem.
- The thread ID is kept in the folder name to make collisions unlikely.
- `notes.jsonl` is always created for every conversation.
- `chat.jsonl` is always created and stores the serialized messages for that conversation.

## `notes.jsonl`

The first line is a header record that identifies the conversation. Later note entries can be appended as additional JSONL lines.

```jsonl
{"type":"conversation-header","schemaVersion":1,"fileKind":"notes","conversationId":"conversation-2026-03-26T01-32-20-418Z-thread_abc123","threadId":"thread_abc123","channel":"tui","title":"Operator Conversation","createdAt":1774402340418,"updatedAt":1774402340418}
```

Recommended future note entries:

```jsonl
{"type":"note","createdAt":1774402350000,"author":"model","content":"The user wants a lightweight per-conversation notes file."}
```

## `chat.jsonl`

`chat.jsonl` starts with the same style of header record followed by one message record per line.

```jsonl
{"type":"conversation-header","schemaVersion":1,"fileKind":"chat","conversationId":"conversation-2026-03-26T01-32-20-418Z-thread_abc123","threadId":"thread_abc123","channel":"tui","title":"Operator Conversation","createdAt":1774402340418,"updatedAt":1774402400000}
{"type":"message","conversationId":"conversation-2026-03-26T01-32-20-418Z-thread_abc123","threadId":"thread_abc123","messageId":"msg_01","role":"system","channel":"tui","content":" is online.","createdAt":1774402340418}
{"type":"message","conversationId":"conversation-2026-03-26T01-32-20-418Z-thread_abc123","threadId":"thread_abc123","messageId":"msg_02","role":"user","channel":"tui","content":"what errors happened today?","createdAt":1774402350000}
```

`storage/runtime.sqlite` is no longer part of the runtime layout. The runtime now uses structured files under `storage/state/`, `storage/conversations/`, and per-run log sessions under `storage/sessions/<utc-timestamp>/system.log`.
