# {{PROJECT_NAME}} — Commands

> Only commands proven to work in THIS project, with exact flags.

## Daily loop (fast → slow)
npm install                       # also runs `nuxt prepare` (generates .nuxt/ types)
npm run test                      # vitest unit suite — seconds, ALWAYS first
npm run build                     # production build → .output/
npm run dev                       # dev server, http://localhost:3000

## Proof commands (DELIVERY.md etiquette)
node .output/server/index.mjs                       # run the production build locally
curl -s http://localhost:3000/api/health           # the single health endpoint
curl -s http://localhost:3000/ | grep -i "<h1"     # SSR proof: content present without JS

## E2E (Playwright)
npx playwright install            # once per machine — downloads browsers
npm run test:e2e                  # boots its own dev server (webServer in playwright.config.ts)

## Watch modes
npm run test:watch                # vitest watch
