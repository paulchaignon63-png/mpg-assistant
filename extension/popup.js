const appUrl = document.getElementById("appUrl");
const leagueCode = document.getElementById("leagueCode");
const status = document.getElementById("status");

chrome.storage.sync.get(["appUrl", "leagueCode"], (v) => {
  appUrl.value = v.appUrl || "";
  leagueCode.value = v.leagueCode || "";
});

document.getElementById("save").addEventListener("click", async () => {
  const url = appUrl.value.trim().replace(/\/$/, "");
  try {
    const origin = new URL(url).origin;
    // Une adresse personnalisée (hors *.vercel.app et localhost) demande une autorisation.
    if (!/\.vercel\.app$|^http:\/\/localhost/.test(origin)) {
      const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
      if (!granted) {
        status.textContent = "Autorisation refusée pour cette adresse.";
        return;
      }
    }
    JSON.parse(decodeURIComponent(escape(atob(leagueCode.value.trim()))));
    await chrome.storage.sync.set({ appUrl: url, leagueCode: leagueCode.value.trim() });
    status.textContent = "Enregistré. Ouvre mpg.football et touche « 11 parfait ».";
  } catch {
    status.textContent = "Adresse ou code invalide.";
  }
});
