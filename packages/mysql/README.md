# @tenetkit/mysql

MySQL runtime backend for TenetKit.

```bash
bun add effect@4.0.0-rc.112 tenetkit@0.44.0 @tenetkit/mysql@0.44.0
```

Use `layer(options)` under Node 22+ or Bun 1.4+ to provide the Runtime services. Schema deployment stays separate through `RuntimeSchema.plan`, `RuntimeSchema.check`, and `RuntimeSchema.apply` from this package.
