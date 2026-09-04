# Deployment

Mintlify owns the documentation build and deployment from the `docs/` directory. Connect the repository and set the
Mintlify docs path to `docs`; pushes then use `docs/docs.json` and the Markdown pages in that directory.

Before merging documentation changes, run:

```console
bun run docs:build
```

This validates Mintlify configuration and checks internal links, anchors, and redirects. `bun run dev` starts the local
Mintlify preview. The retired Foldkit docs app and its Railway smoke script are intentionally not deployment paths.
