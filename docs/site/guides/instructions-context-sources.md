# Instructions and Context Sources

`Instructions` is an ordered registry of context sources. Baseline sources render once at run start into the system-message baseline. Dynamic sources are retained for later update rendering by features such as compaction.

Repository instruction files, skills catalogs, memory recall, and host context all compose as sources. Baton keeps the payload vocabulary as `Ai.Prompt` and does not invent a second wire format.
