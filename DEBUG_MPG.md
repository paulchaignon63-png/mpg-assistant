# Vérifier nextRealGameWeekDate (format API MPG)

## Pas à pas

### 1. Connecte-toi à l'app

- Ouvre ton app (localhost ou Vercel)
- Connecte-toi avec tes identifiants MPG

### 2. Ouvre la console du navigateur

- Appuie sur **F12** (ou Clic droit > Inspecter)
- Onglet **Console**

### 3. Exécute cette commande

Colle et exécute (Entrée) :

```javascript
fetch('/api/debug/mpg-dashboard', {
  headers: { Authorization: localStorage.getItem('mpg_token') }
})
  .then(r => r.json())
  .then(data => {
    console.log('Résultat:', data);
    if (data.sample?.length) {
      data.sample.forEach((l, i) => {
        console.log(`Ligue ${i + 1}:`, l.name, '| nextRealGameWeekDate:', l.nextRealGameWeekDate, '| type:', l.nextRealGameWeekDateType);
      });
    }
  });
```

### 4. Vérifie le résultat

Dans la console, tu verras :

- **count** : nombre de ligues
- **sample** : pour chaque ligue, `nextRealGameWeekDate` et son type (string, number, undefined)
- **rawFirstLeague** : la première ligue complète

### 5. Ce qu'il faut regarder

| Cas | Signification |
|-----|---------------|
| `nextRealGameWeekDate: undefined` | L'API MPG ne renvoie pas ce champ |
| `nextRealGameWeekDate: "2026-02-27T19:45:00.000Z"` | Format ISO 8601 (OK) |
| `nextRealGameWeekDate: 1738077900` | Timestamp secondes (OK) |
| `nextRealGameWeekDate: 1738077900000` | Timestamp millisecondes (OK) |

### 6. Envoie-moi le résultat

Si tu partages le JSON ou une capture de la console, je pourrai adapter le parser si le format diffère.
