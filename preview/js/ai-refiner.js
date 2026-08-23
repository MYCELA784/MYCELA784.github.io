/* PUBLIC API
 *   MYCELA.AIRefiner.refine(query)
 *     → Promise<{ matches: string[], explanation?: string, tips?: string[] } | null>
 *
 * Posts query to the backend proxy (URL and timeout from MYCELA.CONFIG.search).
 * The backend holds the Claude API key; this file never touches it.
 * Returns null on any network error — callers degrade gracefully.
 */
(function (ns) {
  async function refine(q) {
    const CFG = MYCELA.CONFIG.search;
    try {
      const res = await fetch(CFG.backendUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: q }),
        signal:  AbortSignal.timeout(CFG.aiTimeoutMs),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  ns.AIRefiner = { refine };
})(window.MYCELA = window.MYCELA || {});
