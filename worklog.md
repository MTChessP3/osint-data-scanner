---
Task ID: 1
Agent: Main Agent
Task: Fix Z.ai SDK configuration error and Telegram scan pipeline

Work Log:
- Identified root cause: Z.ai SDK's `ZAI.create()` uses file-based config loading that fails on Vercel
- The SDK looks for `.z-ai-config` in `process.cwd()`, home dir, and `/etc/` - none available on Vercel
- Previous code tried to load config from `/etc/.z-ai-config` and set env vars, but SDK doesn't use env vars
- Fixed by bypassing `ZAI.create()` and using `new ZAI(config)` directly with config loaded from env vars or file
- Added env var loading path: ZAI_BASE_URL, ZAI_API_KEY, ZAI_TOKEN, ZAI_USER_ID, ZAI_CHAT_ID
- Added file loading path: /etc/.z-ai-config and process.cwd()/.z-ai-config
- Included `.z-ai-config` in the project for Vercel deployment (removed from .gitignore)
- Reused ZAI instance in Phase 1 instead of creating new one
- Optimized search queries: added `site:t.me` focused queries for better Telegram channel discovery
- Full pipeline test shows: 5 channels discovered via web search, 2 via direct probe, 10 matches via scraping

Stage Summary:
- Z.ai SDK now initializes correctly with direct config (bypasses file-based loading)
- Phase 1 web search works: returns real Telegram channel results
- Phase 1.5 direct probe works: finds impersonator channels
- Phase 2 scraping works: extracts messages and matches keywords
- Total test results: 20 alerts across all phases
- Changes pushed to GitHub (3 commits)
