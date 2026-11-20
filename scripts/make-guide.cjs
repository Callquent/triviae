// Génère tools/commun/AJOUTER-UNE-APPLICATION.pdf depuis guide-ajouter-application.html (Playwright + Chromium).
// Usage : NODE_PATH=$(npm root -g) node scripts/make-guide.cjs
const { chromium } = require("playwright");
const path = require("path");
(async () => {
  const dir = path.resolve(__dirname, "..", "tools", "commun");
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("file://" + path.join(dir, "guide-ajouter-application.html"));
  await p.pdf({
    path: path.join(dir, "AJOUTER-UNE-APPLICATION.pdf"),
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: '<div style="width:100%;font:8px sans-serif;color:#667;padding:0 17mm;display:flex;justify-content:space-between"><span>Triviae — Ajouter une application</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    margin: { top: "18mm", bottom: "20mm", left: "17mm", right: "17mm" },
  });
  await b.close();
})();
