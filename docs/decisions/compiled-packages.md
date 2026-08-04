# Publish compiled packages

Distribute pure ESM JavaScript and declarations rather than repository TypeScript. Clean Node and Bun consumers must work without workspace protocols, source paths, maps, or Bun's TypeScript loader. The eleven tarballs are built and packed once, verified as exact release assets, checksummed, attested, attached to GitHub releases, and published unchanged to npm. Baton does not require a native matrix, CommonJS build, or installer.
