#!/usr/bin/env node
/**
 * Free the default API port (8787) so `npm run dev` can start the Express server.
 * Usage: node scripts/free-api-port.mjs   or   PORT=8788 node scripts/free-api-port.mjs
 */
import { execSync } from 'child_process'

const port = process.env.PORT || '8787'
try {
  const out = execSync(`lsof -ti:${port}`, { encoding: 'utf8' }).trim()
  if (!out) {
    console.log(`[free-api-port] Nothing listening on :${port}`)
    process.exit(0)
  }
  const pids = out.split(/\s+/).filter(Boolean)
  execSync(`kill -9 ${pids.join(' ')}`, { stdio: 'inherit' })
  console.log(`[free-api-port] Stopped process(es) on port ${port}: ${pids.join(', ')}`)
} catch {
  console.log(`[free-api-port] Could not free port ${port} (nothing to kill, or lsof unavailable).`)
  process.exit(0)
}
