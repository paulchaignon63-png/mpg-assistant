// Panneau « Le 11 parfait » sur le site MPG : bouton flottant, puis la compo
// recommandée avec, pour chaque joueur, sa probabilité d'être titulaire.
(() => {
  if (document.getElementById("onze-parfait-btn")) return;

  const POS = { G: "Gardien", D: "Défense", M: "Milieu", A: "Attaque" };
  const band = (p) => (p >= 0.9 ? "#10B981" : p >= 0.6 ? "#A3E635" : p >= 0.4 ? "#F59E0B" : "#EF4444");
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const btn = document.createElement("button");
  btn.id = "onze-parfait-btn";
  btn.textContent = "11 parfait";
  document.body.appendChild(btn);

  const panel = document.createElement("aside");
  panel.id = "onze-parfait-panel";
  panel.hidden = true;
  document.body.appendChild(panel);

  const header = (title) => `<header><b>${esc(title)}</b><button data-close aria-label="Fermer">×</button></header>`;

  function render(res) {
    if (!res?.ok) {
      panel.innerHTML = `${header("Le 11 parfait")}<p class="op-err">${esc(res?.error || "Erreur")}</p>`;
      return;
    }
    const r = res.data;
    const starters = r.players.filter((p) => p.role === "starter");
    const bench = r.players.filter((p) => p.role === "bench").sort((a, b) => a.benchOrder - b.benchOrder);
    const row = (p, prefix = "") => `
      <li>
        <span class="op-dot" style="background:${band(p.pStart)}"></span>
        <span class="op-name">${esc(prefix)}${esc(p.name)}${p.id === r.captainId ? " <em>C</em>" : ""}</span>
        <span class="op-num">${Math.round(p.pStart * 100)} %</span>
        <span class="op-num">${p.noteMean.toFixed(1)}</span>
      </li>`;
    const f = String(r.formation);
    panel.innerHTML = `
      ${header(`${res.leagueName} · J${r.round}`)}
      <p class="op-sum"><b>${r.teamScore}/100</b> · ${f[0]}-${f[1]}-${f[2]} · ${esc(r.summary)}</p>
      ${["G", "D", "M", "A"]
        .map((pos) => `<h4>${POS[pos]}</h4><ul>${starters.filter((p) => p.position === pos).map((p) => row(p)).join("")}</ul>`)
        .join("")}
      <h4>Banc, dans l'ordre</h4><ul>${bench.map((p) => row(p, `${p.benchOrder}. `)).join("")}</ul>
      <p class="op-foot">Titulaire % · note attendue — <a href="${esc(res.appUrl)}" target="_blank" rel="noopener">ouvrir l'app</a></p>`;
  }

  btn.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    if (panel.hidden) return;
    panel.innerHTML = `${header("Le 11 parfait")}<p>Calcul de ta compo…</p>`;
    chrome.runtime.sendMessage({ type: "recommend" }, render);
  });
  panel.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) panel.hidden = true;
  });
})();
