# Publish compiled packages

Distribute pure ESM JavaScript and declarations rather than repository TypeScript. One tarball is built and packed once, checksummed, attested, attached to the GitHub release, and published unchanged to npm. Host adapters are subpath exports of that package and their driver dependencies are optional peers, so consumers install only what they import. Generalist does not require a native matrix, CommonJS build, or installer.
