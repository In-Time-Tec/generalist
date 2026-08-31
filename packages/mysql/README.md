# @generalist/mysql

MySQL runtime backend for Generalist.

```bash
bun add effect@4.0.0-rc.112 generalist@0.44.0 @generalist/mysql@0.44.0
```

Use `layer(options)` under Node 22+ or Bun 1.4+ to provide the Runtime services. Schema deployment stays separate through `RuntimeSchema.plan`, `RuntimeSchema.check`, and `RuntimeSchema.apply` from this package.
