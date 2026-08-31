# Memory

Memory is an optional recall, remember, and forget seam. Hosts choose the memory key; Generalist never derives a subject or retention policy.

- Recall inserts one structurally marked user message after system context and before the run prompt.
- Retention removes structurally marked recalled context, not equal text, so matching user-authored text remains eligible.
- With Session and compaction, retention projects from the lossless Session path and excludes synthetic recall and checkpoint content.
- Forget is host-requested for a whole key or one implementation-owned item id.
- `generalist/memory` provides non-durable working-memory, vector, and semantic-recall layers. Durable storage remains host-owned.
