# Module Scraping - enrichissement du pool MPG

Récupération de données sportives depuis des sites gratuits pour compléter API-Football et MPGStats. En mode free, API-Football ne donne que des saisons passées (2022-2024) ; le scraping fournit des données actuelles.

## Stratégie de fallback

Pour toute source **MPGStats** ou **API-Football**, le fallback est : **Transfermarkt + Sofascore**  
Voir `lib/sources-fallback.ts`.

| Source primaire | Fallback |
|-----------------|----------|
| API-Football (blessures) | Transfermarkt + Sofascore |
| API-Football (rang adversaire) | Sofascore (classement + matchs) |
| MPGStats (stats joueurs) | Transfermarkt + Sofascore |

## Sources implémentées

| Source | Données | Techno | Remarques |
|--------|---------|--------|-----------|
| **L'Equipe** | News L1, blessures, transferts | HTML + Cheerio | |
| **Transfermarkt** | Blessures, transferts (L1, PL, Liga, etc.) | HTML + Cheerio | ID joueur, position, âge, valeur, dates |
| **Sofascore** | Classement, matchs, difficulté adversaire | API JSON (interne) | api.sofascore.com |
| **Eurosport** | News foot | HTML + Cheerio | |
| **RSS RMC Sport** | News foot, Ligue 1, mercato | XML fetch | rmcsport.bfmtv.com |
| **RSS BBC Sport** | News foot, Premier League | XML fetch | feeds.bbci.co.uk |
| **RMC général** | Actualité sport | XML fetch | rmc.bfmtv.com |
| **Flashscore** | - | Stub | SPA → Puppeteer pour plus tard |
| **Sofascore** | - | Stub | API à explorer |

## Variables d'environnement

| Variable | Rôle | Défaut |
|----------|------|--------|
| `ENABLE_SCRAPED_INJURIES` | Activer scraping pour blessures | `1` (activé) |
| `ENABLE_API_FOOTBALL` | Appeler API-Football (saisons 2022-2024) | `0` (désactivé en free) |
| `API_FOOTBALL_KEY` | Clé API (si plan payant) | - |

## API

```ts
import { aggregateScrapedData } from "@/lib/scrapers";

const data = await aggregateScrapedData({
  transfermarkt: true,
  lequipe: true,
  eurosport: true,
  rss: true,
  maxNewsPerSource: 25,
});
// data.news, data.injuries, data.transfers, data.sourcesOk, data.sourcesFailed
```

**Endpoint** : `GET /api/scraped` - retourne l'agrégat complet (news, blessures, transferts).

## Intégration blessures

- `ENABLE_SCRAPED_INJURIES !== "0"` : scraping activé par défaut (Transfermarkt + RSS/news type injury).
- `ENABLE_API_FOOTBALL=1` : appelle aussi API-Football (données obsolètes en plan free).
- **Contextualisation** : les blessures incluent `clubName` ; le matching utilise le club du joueur pour éviter les homonymes.
- **Filtrage ligue** : news et RSS filtrés selon le championnat MPG (`championshipId`).
- Voir `lib/scraped-injuries-service.ts`, `lib/league-config.ts`.

## Attention légale

- Vérifier les Conditions d’utilisation de chaque site
- Respecter robots.txt, rate-limiting (2 s entre requêtes)
- Transfermarkt interdit le scraping dans ses ToS
- Usage personnel / éducatif conseillé
