# Publish compiled packages

Publish ESM JavaScript and declarations rather than repository TypeScript. Clean Node and Bun consumers must work without workspace protocols, source paths, or Bun's TypeScript loader. Release verification therefore runs against packed tarballs, and publishing uses those same files.
