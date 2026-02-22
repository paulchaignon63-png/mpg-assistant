# Plan Produit 1 - Fantasy Assistant MPG

## Ce qui a été construit (MVP)

### 1. Client MPG
- **Auth simple** : `POST /api/mpg/auth` avec email/password
- **Dashboard** : `GET /api/mpg/dashboard` - ligues + équipes
- **Équipe** : `GET /api/mpg/team/[teamId]`
- **Division** : `GET /api/mpg/division/[divisionId]`
- **Recommandations** : `POST /api/mpg/recommendations` - meilleur 11

### 2. Algorithme de recommandation
- Extraction des joueurs du squad MPG (goalkeeper, defenders, midfielders, attackers)
- Score = (matchs/journées) × moyenne × (1 + buts × coeff position)
- Formations supportées : 343, 352, 433, 442, 451, 532, 541

### 3. UI
- **/** : Page de connexion MPG
- **/dashboard** : Liste des ligues (clic → équipe)
- **/equipe/[teamId]** : Meilleur 11 recommandé

### 4. Pas encore implémenté
- Auth OIDC (comptes créés après février 2025)
- API-Football pour blessures/forme (optionnel)
- Supabase (persistance, auth utilisateur)
- Notifications email (cron J-2)

## Lancer l'app

```bash
cd mpg-assistant
npm run dev
```

Ouvre http://localhost:3000 et connecte-toi avec tes identifiants MPG.

## Structure du squad MPG

Le squad peut avoir des clés comme : `goalkeeper`, `defenders`, `midfielders`, `attackers` (ou variantes). L'algo s'adapte. Si la structure réelle diffère, adapter `extractPlayersFromSquad` dans `lib/recommendation.ts`.
