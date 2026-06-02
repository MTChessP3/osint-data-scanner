---
Task ID: 1
Agent: Main Agent
Task: Fix "Alertas Detectadas" showing no results - replace broken search with working channel scraping

Work Log:
- Identified root cause: DuckDuckGo scraping blocked from Vercel, Z.ai internal API inaccessible from Vercel
- Tested Z.ai web search from this environment - works perfectly with internal-api.z.ai
- Tested Z.ai public API (api.z.ai/api/v1) - returns 404 for functions/invoke
- Tested t.me/s/ channel scraping - works from any environment, returns real messages
- Rewrote telegram-web-search.ts with 4 search methods:
  1. Primary: t.me/s/ channel scraping (works from Vercel)
  2. Z.ai SDK (works from Z.ai network only)
  3. Z.ai internal API direct call (works from Z.ai network only)
  4. Broader search queries as fallback
- Added searchKnownTelegramChannels() with 40+ known channels
- Added scrapeTelegramChannel() for reading public channel previews
- Updated scan_groups route to run channel scraping as METHOD 1 (primary)
- Updated frontend to show channel_scrape source type with emerald color
- Added source legend (Web/Canal/Bot) to Alertas Detectadas section
- Updated "How it works" description to mention 3 methods
- Increased keyword limit from 3 to 5 per scan
- Fixed regex parsing error (escaped / in regex)

Stage Summary:
- Channel scraping finds 55 matches across 9 channels for 8 keywords
- Keywords matched: fraud, hack, leak, scam, phishing, credential, estafa, bancolombia
- Channels with matches: ciberseguridad, Group_IB, seguridadinformatica, notoscam, hackplayers, PasaenBogotaSrBacca, EnZonaBX, bancolombia, GrupoBancolombia
- Build successful, pushed to GitHub (2 commits)
- Vercel auto-deploys on push
