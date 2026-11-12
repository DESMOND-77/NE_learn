# Architecture et contrats

## Organisation

- `packages/core` : fonctions métier pures, sans HTTP ni base (IPv4, VLSM, numération, télécoms, quiz, progression), testées avec `node:test`.
- `content/` : curriculum et ressources JSON, cours, questions, TP et fiches d'assistant. Chargement et validation au démarrage ; formats décrits dans `content/README.md`.
- `apps/api` : Express, services d'apprentissage et d'authentification, adaptateurs SQLite et catalogue, sécurité et routes HTTP.
- `apps/web` : React/Vite, pages, composants pédagogiques et clients `/api` relatifs. Les outils partagent les calculs de `core`.
- `scripts/` : développement, validation du contenu et sauvegarde ; `.github/workflows/ci.yml` : contrôles et tests navigateur.

SQLite conserve utilisateurs, sessions, progression des leçons et TP, tentatives de quiz, examens temporaires et événements d'audit. Le catalogue est lu en mémoire au démarrage : redémarrer l'API après modification de JSON. Les migrations futures restent à concevoir ; le schéma initial est créé au démarrage.

## API principale

Toutes les routes sont préfixées par `/api` et échangent du JSON, sauf téléchargements de TP. Les erreurs ont la forme `{ "error": { "code": "…", "message": "…" } }`.

| Usage | Méthodes et routes |
|---|---|
| Santé et catalogue | GET `/health`, `/catalog`, `/courses/:id`, `/glossary`, `/resources` |
| Compte | POST `/auth/register`, `/auth/login`, `/auth/logout` ; GET/PATCH `/auth/me` |
| Progression | GET `/dashboard` ; PUT `/progress/lessons/:courseId/:lessonId` |
| Évaluation | GET `/quizzes/:id` ; POST `/quizzes/:id/submissions` ; POST `/exams`, GET `/exams/:id`, POST `/exams/:id/submissions` |
| TP | GET `/labs/:id`, PUT `/labs/:id/checklist`, POST `/labs/:id/validation`, GET `/labs/:id/files/:name` |
| Accompagnement | POST `/assistant`, `/tools/subnet`, `/tools/vlsm` |

Les quiz publics masquent réponses et corrections avant soumission ; la correction est calculée côté serveur. Le compte est requis pour enregistrer progression et TP. Les examens expirent après deux heures. Les références, hypothèses et corrections des calculateurs accompagnent les résultats affichés.

## Sécurité et limites

Mots de passe hachés avec scrypt ; jetons de session aléatoires dont seul le condensat est conservé ; cookie HttpOnly et SameSite=Lax, durée sept jours ; contrôles d'origine sur mutations, limitation de débit en mémoire, Helmet/CSP en production, validations et audit d'événements. `COOKIE_SECURE=true` est requis derrière HTTPS. Les rôles sont présents dans le modèle, mais il n'existe pas encore de console d'administration ni de gestion complète des permissions ; tous les comptes créés sont étudiants. Il n'y a ni réinitialisation de mot de passe, ni vérification d'e-mail, ni MFA. Voir les mesures complémentaires dans le guide de déploiement.
