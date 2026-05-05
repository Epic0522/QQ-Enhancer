# Hub Integration

The host Hub should treat QQ Enhancer as optional:

1. Try to import the package from `CODEX_REMOTE_CONTACT_QQ_ENHANCER_MODULE`.
2. Try a local source path such as `src/qq-enhancer/index.js`.
3. Try a bundled module path such as `modules/qq-enhancer/index.js`.
4. Try a sibling update package such as `../qq-enhancer/src/qq-enhancer/index.js`.
5. If all imports fail, continue with no-op fallback functions.

Recommended host switches:

```bash
CODEX_REMOTE_CONTACT_QQ_ENHANCER=1
CODEX_REMOTE_CONTACT_QQ_PROACTIVE=1
CODEX_REMOTE_CONTACT_QQ_PROACTIVE_MIN_INTERVAL_MS=180000
CODEX_REMOTE_CONTACT_QQ_STICKER_DIR=/absolute/path/to/qq-stickers
```

When disabled or missing, the host should still:

- receive QQ messages
- run normal command routing
- produce basic text replies
- avoid proactive replies, image inspection, sticker markers, and roast-specific prompt additions
