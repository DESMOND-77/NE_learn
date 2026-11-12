# NE_learn — Contenu pédagogique

Ce dossier contient les contenus pédagogiques structurés de la plateforme. Ils sont
chargés et validés au démarrage de l'API (`scripts/validate-content.mjs`), puis servis
au frontend. Le contenu est découplé du code : ajouter un cours ne nécessite aucune
modification du frontend.

## Structure

```
content/
  curriculum.json     → niveaux académiques, objectifs, modules (disponibles ou planifiés)
  courses/*.json      → cours complets (leçons, blocs pédagogiques, références)
  labs/*.json         → travaux pratiques (topologie, étapes, configs, correction)
  quizzes/*.json      → quiz (questions typées, corrigés côté serveur uniquement)
  glossary.json       → glossaire français/anglais
  resources.json      → documentation externe attribuée (RFC, IEEE, constructeurs…)
  assistant-kb.json   → base de connaissances de l'assistant pédagogique
```

## Format d'un cours

Chaque cours suit le modèle pédagogique homogène : objectifs → prérequis → leçons
(introduction accessible, explication technique, exemples, commandes, manipulation,
résumé) → quiz de validation → références.

Types de blocs disponibles dans une leçon :

| Bloc | Rôle |
|---|---|
| `paragraph` | Texte (supporte `**gras**` et `` `code` ``) |
| `heading` | Sous-titre |
| `list` | Liste à puces ou ordonnée |
| `table` | Tableau comparatif ou de synthèse |
| `code` | Commandes / configuration (avec légende) |
| `note` | Encadré info / astuce / attention |
| `formula` | Formule mathématique commentée |
| `interactive` | Composant interactif (`osi-explorer`, `encapsulation`, `subnet-visualizer`, `signal-lab`, `sampling-lab`, `modulation-lab`, `vlan-visualizer`, `protocol-sequence`) |
| `quiz-link` | Renvoi vers le quiz du cours |
| `lab-link` | Renvoi vers un laboratoire |

## Règles de qualité

1. Exactitude technique avant volume : pas de remplissage.
2. Français par défaut, terme anglais entre parenthèses à la première occurrence.
3. Distinguer **standard** (RFC/IEEE), **bonne pratique** et **implémentation constructeur**.
4. Toute question de quiz porte `explanation`, et si possible `reasoning`, `pitfalls`, `courseRef`.
5. Les réponses des quiz ne sont jamais envoyées au client avant soumission.
6. Référencer les sources primaires (RFC, documentation officielle) dans `references`.
7. Les fichiers de laboratoire distribués sont du texte (configs, CSV, guides) : la
   plateforme ne prétend pas exécuter Packet Tracer ou GNS3 dans le navigateur.

## Ajouter un cours

1. Créer `content/courses/<id>.json` en respectant le schéma (`npm run lint:content`).
2. Créer le quiz associé dans `content/quizzes/`.
3. Référencer le cours dans `content/curriculum.json` (module `available: true`).
4. Lancer `npm run lint:content` puis `npm test`.
