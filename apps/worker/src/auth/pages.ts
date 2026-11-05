/**
 * pages.ts — the few HTML pages the Worker serves before the v2 app exists:
 * MCP consent and plain messages. Everything that came from a client (its
 * name, its redirect host) is escaped: dynamic registration means an attacker
 * chooses it. The pages adopt the design layer with the app (P4).
 */

import type { ConsentDescription } from '@cloudflare/workers-oauth-provider'

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)

const layout = (title: string, body: string): string => `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · HECATE</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; line-height: 1.5; }
  body { max-width: 34rem; margin: 3rem auto; padding: 0 1rem; }
  .warn { border-left: 4px solid currentColor; padding-left: 0.75rem; }
  button { font: inherit; padding: 0.5rem 1rem; margin-right: 0.5rem; min-height: 2.75rem; }
</style>
<main>
${body}
</main>
</html>`

export function consentPage(details: ConsentDescription, handle: string): string {
  const name = escapeHtml(details.clientName)
  const origin = details.clientDomain
    ? `Published by <strong>${escapeHtml(details.clientDomain)}</strong>.`
    : 'This app registered itself, so its name is not verified.'
  return layout(`Allow ${details.clientName}`, `
<h1>Allow ${name} to use HECATE?</h1>
<p>${origin} It will be able to read and change your HECATE workspaces. Access will be sent to <strong>${escapeHtml(details.redirectHost)}</strong>.</p>
${details.redirectIsLoopback ? '<p class="warn"><strong>This sends access to an app on your computer.</strong> Continue only if you just started connecting from it.</p>' : ''}
<p>Next, GitHub confirms it is you.</p>
<form method="post">
  <input type="hidden" name="handle" value="${escapeHtml(handle)}">
  <p><label><input type="checkbox" name="remember" value="1" checked> Don't ask again for this app for 30 days</label></p>
  <p><button name="decision" value="approve">Allow</button><button name="decision" value="deny">Deny</button></p>
</form>`)
}

export function messagePage(title: string, message: string, status: number, headers: HeadersInit = {}): Response {
  return new Response(layout(title, `<h1>${escapeHtml(title)}</h1>\n<p>${escapeHtml(message)}</p>`), {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'", ...headers },
  })
}
