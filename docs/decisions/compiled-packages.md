# Publish compiled packages

Distribute pure ESM JavaScript and declarations rather than repository TypeScript. Clean Node and Bun consumers must work without workspace protocols, source paths, maps, or Bun's TypeScript loader. The four lockstep tarballs are built and packed once, verified as exact release assets, checksummed, attested, attached to GitHub releases, and published unchanged to npm. TenetKit does not require a native matrix, CommonJS build, or installer.
