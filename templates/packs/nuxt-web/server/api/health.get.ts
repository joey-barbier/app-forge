// The SINGLE health endpoint — Docker HEALTHCHECK, orchestrator checks, deploy
// gates and uptime monitoring all point HERE and nowhere else (OPS_WEB.md §7).
export default defineEventHandler(() => ({
  status: 'ok',
  service: '{{BUNDLE_ID}}',
  time: new Date().toISOString(),
}))
