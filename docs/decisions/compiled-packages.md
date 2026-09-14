# Publish compiled packages

Distribute pure ESM JavaScript and declarations rather than repository TypeScript. Clean Node and Bun consumers must work without workspace protocols, source paths, maps, or Bun's TypeScript loader. One lockstep tarball is built and packed once, verified as the exact release asset, checksummed, attested, attached to the GitHub release, and published unchanged to npm. Optional protocol and S3 dependencies remain attached only to the subpaths that need them. Generalist does not require a native matrix, CommonJS build, or installer.
