# Restore full source tree from archive parts

This folder holds a base64-split gzip tar of the complete APEX Crypto AI Council project (all `src/`, `web/`, `tests/`, `worker/`, docs).

## Restore

```bash
cd apex-crypto-ai-council
cat RELEASE/part-*.b64 | base64 -d | tar -xzf -
```

That expands the full tree into the current directory.

## Why

GitHub connector uploads are size-batched; this guarantees a complete copy in one place while individual source files continue to be added on `main`.
