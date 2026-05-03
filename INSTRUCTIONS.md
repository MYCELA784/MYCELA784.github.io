This is the same plan I just rejected. You wrote "File structure 
(unchanged)" — that is exactly what needs to change. Read this carefully.

The structure must be 14 files, not 6. Use this exact tree:

  index.html
  css/
    styles.css                    ← all inline <style> moves here
  js/
    config.js                     ← CONFIG = { search:{}, scoring:{}, fallback:{} }
    constants.js                  ← BC (brand colors), TI (type icons)
    db.js                         ← DB array, DB_MAP lookup
    search/
      parsers.js                  ← bore, od, width, compact, rpm, loads, type, brand, env, app, tokens
      rules.js                    ← EnvironmentRules[], ApplicationRules[]
      scoring.js                  ← partNumber(), brand(), bore(), od(), width(), loads(), rpm(), sealing(), applications() — each reads CONFIG.scoring
      fallback.js                 ← progressive relaxation stages
      engine.js                   ← SearchEngine = { parse, fast, fallback, scoreBearing }
    ai-refiner.js                 ← AIRefiner.refine(query)
    renderer.js                   ← Renderer.cards(), .modal(), .filterBar(), .aiBox(), .matchBadge()
    router.js                     ← Router.showPage(name)
    supplier-form.js              ← SupplierForm.submit()
    canvas.js                     ← MyceliumCanvas.init()
    app.js                        ← AppState + event listeners + init wiring
  bearings_db.js                  ← untouched

Reasons each split exists, in case the rationale isn't obvious:

- css/styles.css: inline CSS in a 1500-line HTML file is unmaintainable. 
  Move it.
- js/config.js: ALL tunable values (scoring weights like s+=60, timeouts 
  like 12000, the backend URL) move into one CONFIG object. The whole 
  point of the refactor is so I can tune ranking without hunting through 
  search code.
- js/constants.js: BC and TI are reference data, not logic. Separate file.
- js/db.js: even if it's small now, DB loading and DB_MAP belong together 
  and separate from search.
- js/search/ subfolder with 5 files: parsers, rules tables, scoring, 
  fallback, and engine API are five distinct concerns. Each becomes a 
  short, focused file. This is where the most future tuning happens — it 
  must be the most modular part.
- Separate ai-refiner, renderer, router, supplier-form, canvas, app: 
  each handles ONE thing. When I want to change the modal, I open 
  renderer.js. When I want to change page nav, I open router.js. I 
  shouldn't be scrolling through a 400-line app.js to find anything.

Update index.html script load order accordingly:

  <link rel="stylesheet" href="css/styles.css">
  ...
  <script src="bearings_db.js"></script>
  <script src="js/config.js"></script>
  <script src="js/constants.js"></script>
  <script src="js/db.js"></script>
  <script src="js/search/parsers.js"></script>
  <script src="js/search/rules.js"></script>
  <script src="js/search/scoring.js"></script>
  <script src="js/search/fallback.js"></script>
  <script src="js/search/engine.js"></script>
  <script src="js/ai-refiner.js"></script>
  <script src="js/renderer.js"></script>
  <script src="js/router.js"></script>
  <script src="js/supplier-form.js"></script>
  <script src="js/canvas.js"></script>
  <script src="js/app.js"></script>

Namespace pattern is fine — keep window.MYCELA as the shared namespace 
with each module attaching its own object (MYCELA.SearchEngine, 
MYCELA.Renderer, MYCELA.Router, etc.) instead of flat function dumps.

Show me the corrected plan with all 14 files, the CONFIG object 
structure, and how scoring functions reference CONFIG.scoring values. 
DO NOT write files yet.

Approved with two small fixes:

1. Typo in CONFIG.scoring: "borExact" should be "boreExact". Make sure 
   scoring.js bore() function references the corrected name.

2. Restore the ?debug=1 mode from the previous plan. When 
   window.location.search includes debug=1, app.js doSearch() should 
   console.log:
   - The parsed intent object from SearchEngine.parse()
   - Per-result { score, matchType } breakdown
   - The AI response payload
   No visible UI change, just console output.

Now proceed to write the files. After all 14 files (plus index.html 
edits and css/styles.css) are written:

1. Show me the final file tree (`ls -R` or equivalent)
2. Show me the diff summary — files added, files modified
3. Verify index.html script load order matches the plan
4. DO NOT commit yet. I want to review before commit.

Wait for my approval before committing.