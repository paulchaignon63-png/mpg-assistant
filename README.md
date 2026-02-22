# Fantasy Assistant MPG

Application dédiée à Mon Petit Gazon : récupère tes équipes et te recommande le meilleur 11 chaque semaine.

## Fonctionnalités

- Connexion avec tes identifiants MPG (email/mot de passe)
- Liste de tes ligues et équipes
- Recommandation du meilleur 11 basée sur la forme des joueurs
- Pas de mode Expert requis (lecture seule)

## Démarrage

```bash
npm install
npm run dev
```

Ouvre [http://localhost:3000](http://localhost:3000).

## Configuration

Crée un fichier `.env.local` si tu veux utiliser API-Football pour enrichir les données (blessures, etc.) :

```
NEXT_PUBLIC_API_FOOTBALL_KEY=ta_cle_api
```

## Sécurité

- Tes identifiants MPG ne sont jamais stockés
- Connexion directe à l'API MPG à chaque requête
- Le token est gardé en mémoire côté client (localStorage) pour la session

## API non officielle

Cette app utilise l'API non documentée de MPG, basée sur le projet [mpg-coach-bot](https://github.com/axel3rd/mpg-coach-bot). Elle peut changer à tout moment.
