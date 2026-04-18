# Storage

This folder is part of the normal instance shape and should exist for each instance.

The runtime store writes:

- structured runtime state under `storage/state/`
- per-conversation folders under `storage/conversations/`

The tracked `00` instance should stay clean as the starter template. Local development should use the ignored `personal-instance` path instead of writing runtime state here.
