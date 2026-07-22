# Publish compiled packages

Distribute pure ESM JavaScript and declarations rather than repository TypeScript. Clean Node and Bun consumers must work without workspace protocols, source paths, maps, or Bun's TypeScript loader. The eight platform-neutral tarballs are built and packed once, verified as exact release assets, checksummed, attested, and attached to GitHub releases. Baton does not require a native matrix, CommonJS build, installer, or npm publication.
