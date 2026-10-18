# Le 11 parfait

Assistant pour Mon Petit Gazon (MPG) : ton meilleur 11, ton banc dans l'ordre, ton capitaine et tes chances de victoire, chaque journée.

## Ce que fait l'app

- **Compo optimisée** : formation choisie automatiquement (ou imposée), titulaires, banc ordonné selon la règle de remplacement MPG, capitaine, remplacements tactiques avec seuil de note.
- **Trois modes** : sûr (titulaires certains), équilibré (meilleure espérance), coup de poker (plus haut plafond).
- **Fiche joueur chiffrée** :
  - probabilité d'être titulaire en 4 tranches ;
  - 5 dernières notes ;
  - décomposition de la note attendue ;
  - écart avec l'alternative ;
  - hypothèse « et si » modifiable ;
  - signalement à la communauté.
- **Duel** : avec l'effectif de l'adversaire, probabilité de victoire, nul et défaite (buts réels + buts MPG), Cheat Code compris.
- **Bonus** : force attendue sur les 6 prochaines journées et conseil pour chaque bonus.
- **Bilan et direct** : pronostic figé, puis comparé aux vraies notes. Le bilan sépare la malchance (écart au pronostic) des choix (écart au meilleur 11 possible).
- **Précision publique** : banc d'essai hors échantillon et suivi réel, journée après journée.
- **Import d'effectif** : liste collée, capture d'écran (IA), code de partage, ou connexion MPG.
- **MPG** :
  - import de l'effectif et des bonus ;
  - adversaire de la journée ;
  - envoi de la compo, après confirmation.
- **Alertes push** :
  - compo prête la veille ;
  - titulaire sur le banc (compo officielle) ;
  - blessure ;
  - titularisation qui bouge de plus de 15 points.
- **Extension navigateur** sur mpg.football (dossier `extension/`).

## Le moteur

Tout passe par `lib/engine/recommend.ts`, le seul moteur de l'app.

1. **Données** (`lib/data/mpgstats.ts`) : un fichier MPGStats public par championnat. Il contient l'historique match par match des deux dernières saisons, les incidents, l'Elo des clubs, le calendrier, les scores et les cotes 1-N-2.
2. **Variables** (`lib/engine/features.ts`) : forme récente, niveau de saison, saison passée, titularisations récentes, cote MPG à la date du match, force des deux équipes, domicile. Elles sont calculées uniquement avec les matchs antérieurs à la journée visée.
3. **Modèle** (`lib/engine/model.ts`), appris sur l'historique par `npm run train` :
   - P(noté) et P(titulaire) par régressions logistiques ;
   - note attendue par poste, par régression linéaire ;
   - buts attendus par Poisson.
4. **Signaux** (`lib/engine/project.ts`) :
   - compos probables et officielles (RotoWire + communauté), pondérées par leur fiabilité mesurée ;
   - statut du joueur ;
   - coupe d'Europe ;
   - cotes : clean sheet et buts attendus de l'équipe, cotes buteur ;
   - hypothèses de l'utilisateur.
5. **Simulation** (`lib/engine/simulate.ts`) : Monte-Carlo de la journée avec les règles MPG (`lib/engine/mpg-rules.ts`) : remplaçant du même poste, −1 par ligne sautée, Rotaldo à 2,5.
6. **Optimisation** (`lib/engine/optimize.ts`) : pour chaque formation, le meilleur 11 et le banc, simulés ; on garde le meilleur objectif selon le mode.

L'ancien moteur (`lib/recommendation.ts`) n'est plus utilisé par l'app. Il est gardé pour que le banc d'essai mesure le gain du nouveau.

## Démarrer

```bash
npm install
npm run dev
```

Puis ouvre http://localhost:3000. Toutes les variables d'environnement sont optionnelles : voir `.env.example`.

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm test` | Tests unitaires (Vitest) |
| `npm run lint` | ESLint |
| `npm run train` | Réapprend les coefficients du modèle (L1, PL, Liga, Serie A, L2) → `lib/engine/model/coefficients.json` |
| `npm run backtest -- --champ 1,2 --holdout` | Rejoue les journées passées : nouveau moteur, ancien moteur et choix naïf → `lib/engine/model/backtest-summary.json` (page Précision) |
| `npm run vapid:keys` | Génère les clés des alertes push |

Pense à relancer `npm run train` puis `npm run backtest -- --champ 1,2,3,5 --holdout` de temps en temps, par exemple toutes les 5 journées.

## Mise en production (Vercel)

1. **Supabase** : crée un projet, exécute `supabase/migrations/001_kv.sql`, puis renseigne `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`. C'est indispensable pour les alertes, les votes et le suivi de précision : Vercel n'a pas de disque persistant.
2. **Alertes** : `npm run vapid:keys`, puis renseigne `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` et `VAPID_SUBJECT`.
3. **Tâche planifiée** : renseigne `CRON_SECRET`. `vercel.json` lance `/api/cron/refresh` une fois par jour, la seule fréquence permise par le plan gratuit. Pour un passage toutes les heures (compos officielles, alertes) :
   - ajoute les secrets `APP_URL` et `CRON_SECRET` au dépôt GitHub ;
   - crée la variable `ENABLE_HOURLY_REFRESH=true` : le workflow `.github/workflows/refresh.yml` prend le relais.
4. **Optionnel** : `ANTHROPIC_API_KEY` (chat et import par capture), `ODDS_API_KEY` (cotes buteur).

## Sources et limites

- **MPGStats** (backend public) : notes, minutes, buts, incidents, Elo, calendrier, cotes 1-N-2.
- **RotoWire** : compos probables et officielles pour L1, PL, Liga et Serie A. La Ligue 2 n'est pas couverte.
- **ESPN** : matchs de coupe d'Europe autour de la journée.
- **MPG** : API non officielle, d'après [mpg-coach-bot](https://github.com/axel3rd/mpg-coach-bot). Elle peut changer sans prévenir.
- **Effets non appris, réglés à la main** : coupe d'Europe, ajustement clean sheet et règle approchée du but MPG (`lib/engine/mpg-rules.ts`).
- **Banc d'essai** : il ne voit pas les compos probables, faute d'historique. Pour la saison précédente, la cote MPG de l'époque est inconnue et remplacée par une valeur neutre.
