---
Task ID: 1
Agent: Main Agent
Task: Fix social media scanner and OSINT scanner - complete rewrite for reliability

Work Log:
- Analyzed the entire codebase: social-media-scanner.ts, osint-scanner.ts, page.tsx, API routes
- Identified root cause: sequential scanning (10 platforms × 5 searches + 3 verifications = 600+ seconds) exceeding Vercel's 60s timeout
- Rewrote social-media-scanner.ts (v3.0) with:
  - Parallel platform scanning (3 at a time) instead of sequential
  - Per-platform timeout (15s) and overall scan timeout (55s)
  - HEAD request profile verification (fast, 6s timeout) instead of GET
  - Only 1-2 web searches per platform instead of 4-5
  - Smart platform verification: TikTok, YouTube, Telegram, Snapchat, Pinterest use HEAD; Instagram, Facebook, X, LinkedIn use web search only
  - Better findings with clear labels
- Fixed performWebSearch() in osint-scanner.ts with Z.ai public API direct fallback
- Fixed social-scan API route with timeout protection
- Fixed scan API route with maxDuration and timeout
- Fixed joint-analysis route (removed broken import)
- Installed missing packages (docx, xlsx)
- Build verified: All routes compile successfully

Stage Summary:
- Social media scanner completely rewritten for speed and reliability
- All builds pass
- Code needs to be pushed to GitHub for Vercel deployment
- User needs to push from their local environment or set up git credentials
