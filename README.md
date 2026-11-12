# NE_learn

MVP pédagogique francophone pour comprendre et pratiquer les réseaux et les télécommunications. Les parcours sont consultables librement : les prérequis sont indiqués, sans verrouiller les modules avancés.

## Démarrage

Node.js 22.12 ou plus récent (Node 22 récent recommandé), npm et un navigateur récent sont nécessaires. Depuis la racine :

```bash
npm ci
cp .env.example .env  # facultatif pour les valeurs par défaut
npm run dev
```

Ouvrir l'interface sur <http://localhost:5173>. L'API écoute sur le port 3001 et Vite transmet les requêtes `/api`. La base SQLite locale est créée sous `data/`, ignoré par Git. `node:sqlite` peut afficher un avertissement expérimental selon la version de Node.

Pour construire et démarrer le serveur unique :

```bash
npm run build
NODE_ENV=production npm start
```

Ouvrir <http://localhost:3001>. Consulter [le guide de déploiement](docs/deploiement.md) avant toute exposition publique.

## Fonctionnalités livrées

- 10 cours et 38 leçons, 10 quiz (89 questions), 5 TP guidés et des parcours à quatre niveaux. Le programme est plus large que les contenus actuellement publiés.
- Progression personnelle, tableau de bord et badges ; quiz utilisables sans compte, mais sans enregistrement.
- Calculateurs IPv4/CIDR, VLSM, numération et télécoms, visualisations interactives et exercice de subnetting avec raisonnement.
- TP avec topologie descriptive, checklist, validation et fichiers texte téléchargeables. Packet Tracer, GNS3 et les autres logiciels restent **externes** : aucun simulateur réseau tiers n'est exécuté dans le navigateur.
- Glossaire, références documentaires, projets et assistant local fondé sur des fiches et calculs déterministes. Cet assistant n'est pas une IA générative et indique les sujets qu'il ne sait pas traiter.
- Interface adaptée au mobile, thèmes clair et sombre.

Les parcours ingénieur, certains sujets télécoms et laboratoires avancés, ainsi que les fonctions LMS/SaaS, restent à développer : voir [la feuille de route](docs/roadmap.md). Les contenus pédagogiques sont originaux ; les références externes sont attribuées dans les cours et le catalogue.

## Vérifications

```bash
npm run lint:content
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm audit
```

Les tests navigateur démarrent les serveurs automatiquement si nécessaire. Ils créent des comptes de test dans la base utilisée : employer une base dédiée pour une recette sur serveur partagé. Les autres tests API utilisent SQLite en mémoire. Voir [architecture et API](docs/architecture.md), [contenus](content/README.md) et [déploiement](docs/deploiement.md).
