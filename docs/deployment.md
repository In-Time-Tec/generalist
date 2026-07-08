# Deployment

The docs site (`apps/docs`) deploys through Railway project `batonfx` with two GitHub-triggered environments, both gated on green CI:

- Staging https://batonfx-docs-staging.up.railway.app — auto-deploys every push to `main`.
- Production https://batonfx-docs.up.railway.app — auto-deploys every push to `release`.

Promote staging to production:

```bash
git push origin main:release
```

If `release` ever diverges (direct hotfix), confirm the hotfix landed on `main`, then `git push --force-with-lease origin main:release`. Build config lives in `apps/docs/railway.json`; the static output dir comes from the `RAILPACK_SPA_OUTPUT_DIR=apps/docs/dist` service variable. Verify both environments any time with `scripts/verify-docs-deploy.sh`.
