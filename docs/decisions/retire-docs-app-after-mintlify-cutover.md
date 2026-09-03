# Retire the docs app after the Mintlify cutover

Recommend deleting `apps/docs` in a follow-up after the owner approves and verifies a deployed Mintlify site. The app
currently rebuilds navigation, Markdown rendering, static search, and reference pages that Mintlify supplies, while its
content competes with `docs/features`, `docs/decisions`, `docs/tradeoffs`, and the package README as a second source of
truth.

Keep `apps/docs` unchanged until cutover because it is still the deployed consumer site and its typechecked snippets
remain useful migration evidence. If a future page requires an interactive execution demo that Mintlify cannot host,
retain only that independently useful demo in a deliberately separate app; do not keep a parallel documentation shell
for hypothetical interactivity.
