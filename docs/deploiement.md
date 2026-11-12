# Déploiement et exploitation

Ce MVP n'est pas prêt tel quel pour une exploitation SaaS à grande échelle ou une installation critique. Prévoir une revue de sécurité, la protection des données, la supervision, la gestion des comptes, les migrations et une politique de sauvegarde avant publication.

## Installation

1. Installer Node 22 récent et les dépendances avec `npm ci`.
2. Copier `.env.example` vers `.env`, définir les chemins de stockage persistants et exécuter `npm run lint:content`, `npm test`, `npm run build`.
3. Lancer `NODE_ENV=production npm start` depuis la racine ; le serveur dessert le build et l'API sur `PORT`. Placer un reverse proxy HTTPS devant lui.
4. Activer `COOKIE_SECURE=true`. Mettre `TRUST_PROXY=true` uniquement derrière **un** proxy de confiance qui supprime ou remplace les en-têtes `X-Forwarded-*` entrants et empêche l'accès direct à l'application. Sans cela, laisser `false`.
5. La CSP limite l'intégration en iframe à `FRAME_ANCESTORS` (liste séparée par des virgules, `'self'` par défaut). N'ajouter que les origines explicitement nécessaires. Utiliser des volumes persistants et des permissions de fichiers restrictives.

Le limiteur de débit est local à chaque processus, non distribué. SQLite convient à une instance modeste, pas à une architecture multi-instance distribuée. Aucune garantie de conformité réglementaire n'est implicite ; limiter l'accès aux données et définir leur durée de conservation.

## Sauvegarde et restauration

`npm run backup` crée une copie SQLite cohérente avec `VACUUM INTO` et vérifie son intégrité. Le script lit les variables d'environnement du shell : par exemple `DB_PATH=/chemin/base.sqlite BACKUP_DIR=/chemin/sauvegardes npm run backup`. Il ne charge pas automatiquement `.env`. Automatiser les copies hors machine, leur chiffrement, leur rétention et des essais périodiques de restauration.

Pour restaurer, arrêter l'application, conserver une copie de la base courante, puis remplacer la base configurée par une sauvegarde vérifiée ; avec SQLite/WAL, traiter aussi les fichiers `-wal` et `-shm` de l'ancienne base uniquement après l'arrêt complet, avant de redémarrer. Vérifier la connexion et les données restaurées sur une instance isolée. Sauvegarder séparément les contenus et la configuration nécessaires, sans exposer les secrets.
