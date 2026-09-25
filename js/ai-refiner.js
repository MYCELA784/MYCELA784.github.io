/* PUBLIC API
 *   MYCELA.AIRefiner.refine(query, signal?)
 *     → Promise<{ matches: string[], explanation?: string, tips?: string[] } | null>
 *
 * Posts query to the backend proxy (URL and timeout from MYCELA.CONFIG.search).
 * The backend holds the Claude API key; this file never touches it.
 * Aborting `signal` cancels the request (the caller does this when a newer
 * query supersedes it). Returns null on any network error or abort — callers
 * degrade gracefully.
 */
(function (ns) {
  async function refine(q, signal) {
    const CFG = MYCELA.CONFIG.search;
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CFG.aiTimeoutMs);
    const onAbort = () => ctrl.abort();
    if (signal) {
      if (signal.aborted) ctrl.abort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    try {
      const res = await fetch(CFG.backendUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: q }),
        signal:  ctrl.signal,
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }

  ns.AIRefiner = { refine };
})(window.MYCELA = window.MYCELA || {});
