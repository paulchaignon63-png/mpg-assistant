// Les appels à l'app passent par ici : le service worker de l'extension n'est
// pas soumis aux règles CORS du site MPG.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "recommend") return false;
  chrome.storage.sync.get(["appUrl", "leagueCode"], async ({ appUrl, leagueCode }) => {
    try {
      if (!appUrl || !leagueCode) throw new Error("Configure l'extension : adresse de l'app et code de ta ligue.");
      const league = JSON.parse(decodeURIComponent(escape(atob(leagueCode.trim()))));
      const res = await fetch(`${appUrl.replace(/\/$/, "")}/api/recommendations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          championshipId: String(league.c),
          playerIds: league.p.map((x) => `mpg_${x}`),
          mode: message.mode || "balanced",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Calcul impossible");
      sendResponse({ ok: true, data, leagueName: league.n, appUrl });
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
  return true; // réponse asynchrone
});
