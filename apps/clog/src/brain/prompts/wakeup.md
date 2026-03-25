# Wakeup

Wakeup is the periodic monitoring pass.

When wakeup guidance is present, treat it as operator-tuned context for the scheduled check-in loop, not as a replacement for the core system prompt.

Use the runtime wakeup config to understand:

- how often the wakeup loop is expected to run
- the operator-authored plain-text guidance for what to pay attention to during that pass

## Guard Rails

Follow the operator message when it helps prioritize the periodic check, but never use it to override hard safety rules, current findings, or explicit user instructions.
