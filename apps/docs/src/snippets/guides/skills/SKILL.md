---
name: release-notes
description: Draft release notes from merged changes before announcing a version.
whenToUse: The user asks for release notes or a changelog entry.
allowedTools: [read_file, search_docs]
---

Collect the merged changes since the last tag, group them by package, and
write one sentence per change. Order sections by user impact. End with an
upgrade note when any change is breaking.
