# OKR et PRD — `@messanga11/core`

| Champ | Valeur |
| --- | --- |
| Version | 1.0-draft |
| Statut | Fondation implémentée, pilote produit en attente |
| Propriétaire | Messanga11 Core Maintainers |
| Horizon | Première version stable 1.0 |

## Vision

`@messanga11/core` est un kernel TypeScript headless qui rend les décisions métier, l'autorisation et les transitions d'état réutilisables entre des applications sans imposer de framework d'interface, de stockage ou d'identité. Les shells restent responsables du rendu et des intégrations ; le kernel reste la source de vérité des contrats et politiques.

## État actuel et résultat cible

L'état actuel est un écosystème publiable : contrats, policy, événements, schémas Zod, pipeline protégé, intégration tRPC, état optimiste, fakes, packaging et CI sont opérationnels. Un domaine pilote et des adaptateurs PostgreSQL, Redis, OIDC et OpenTelemetry valident les ports sans rendre le kernel dépendant d'un fournisseur.

Le résultat cible est une bibliothèque isolée avec sept sous-chemins :

- `@messanga11/core` : contrats universels sérialisables ;
- `@messanga11/core/policy` : décision unique utilisée par le serveur et `uiMeta` ;
- `@messanga11/core/events` : enveloppes et ports transactionnels ;
- `@messanga11/core/server` : ports serveur, contexte protégé et politiques ;
- `@messanga11/core/trpc` : adaptateur tRPC 11 optionnel ;
- `@messanga11/core/state` : transitions et mises à jour optimistes headless ;
- `@messanga11/core/testing` : fakes et builders de tests, jamais chargés en production.

## Utilisateurs et problème

Les utilisateurs directs sont les mainteneurs des applications Messanga11 et les équipes TypeScript qui consomment le package. Ils doivent aujourd'hui réimplémenter les contrôles d'accès, erreurs, métadonnées d'interface et stratégies optimistes, ce qui favorise les divergences et les défauts d'isolation.

La proposition de valeur est un contrat unique, testable et indépendant des technologies d'exécution, avec des erreurs précises lors d'une intégration incorrecte.

## Objectif et résultats clés (OKR)

**Objectif :** fournir un kernel stable que deux shells différents peuvent intégrer sans dupliquer les décisions métier.

- KR1 : 100 % des chemins serveur sensibles testés refusent l'accès sans session, tenant, permission ou preuve valide.
- KR2 : les sept sous-chemins passent des smoke tests d'import indépendants ; aucun bundle universel ou state ne charge tRPC ou un module serveur.
- KR3 : une application pilote consomme les contrats, la procédure protégée et l'état optimiste sans importer de type fournisseur dans son domaine.
- KR4 : 100 % des changements d'API publique sont détectés avant publication et accompagnés d'une décision SemVer.
- KR5 : la release candidate s'installe et typechecke depuis le tarball dans deux fixtures de consommation indépendantes.

## Périmètre MVP

### Inclus

1. Contrats universels pour erreurs, résultat et `uiMeta`, plus schémas Zod 4 serveur pour identités, tenant et permissions.
2. Ports injectables pour autorisation, appartenance de ressource, limitation de débit, quota, horloge, audit et reporting interne.
3. Pipeline protégé fail-closed produisant une preuve opaque non forgeable via l'API publique.
4. Adaptateur tRPC 11 optionnel qui applique le pipeline dans un ordre déterministe.
5. Machine d'état optimistic headless avec snapshot, commit, rollback et gestion des réponses hors ordre.
6. Fakes de test déterministes et contract tests des adaptateurs.
7. Packaging ESM/CJS, déclarations TypeScript, CI et publication npm OIDC avec provenance comme cible.

### Non-objectifs

- Aucun composant React, DOM, React Native ou autre UI.
- Aucun ORM, modèle de base de données ou migration de données.
- Aucun fournisseur d'identité, serveur HTTP, stockage, queue ou télémétrie concret.
- Aucun routeur ou règle d'un domaine métier non confirmé.
- Aucun client réseau généré et aucune compatibilité avec une autre majeure tRPC dans le MVP.

## Parcours principal

1. Le mainteneur définit des permissions, schémas d'entrée/sortie et un service métier contre les ports du kernel.
2. Le shell construit les adaptateurs d'identité, d'autorisation, de quota, de débit et d'audit.
3. Le composition root crée le runtime serveur, puis l'adaptateur tRPC.
4. Une requête traverse contexte authentifié/tenant, permission, appartenance de ressource, validation Zod, quota, rate limit et audit d'intention.
5. Une preuve protégée autorise le service ; sa réponse inclut un `uiMeta` calculé depuis la même politique.
6. Le shell peut appliquer une transition optimiste, puis commit ou rollback selon le résultat serveur.

## Parcours d'échec et récupération

- Entrée invalide : erreur `INVALID_INPUT`, aucun adaptateur métier appelé.
- Session absente ou inactive : `UNAUTHENTICATED`, aucun tenant résolu.
- Tenant ou permission invalide : `FORBIDDEN`, détails internes non exposés.
- Rate limit ou quota : erreur sérialisable avec possibilité de nouvel essai uniquement si la politique le permet.
- Adaptateur indisponible : erreur stable `SERVICE_UNAVAILABLE`, rapport interne et audit sans secret.
- Mutation optimiste refusée : restauration du dernier snapshot confirmé ; une réponse obsolète ne peut écraser un état plus récent.
- Configuration incomplète : échec explicite au démarrage, jamais un comportement permissif.

## Exigences et critères d'acceptation

### R1 — Contrats universels

Les contrats publics sont validés à l'exécution par Zod 4 et ne contiennent aucun type fournisseur.

**Acceptation :** les tests de type et runtime couvrent valeurs valides, inconnues, champs supplémentaires et sérialisation JSON.

### R2 — Autorisation fail-closed

Une opération sensible ne reçoit une preuve qu'après toutes les gardes requises.

**Acceptation :** chaque garde est testée négativement ; le handler et les gardes suivantes ne sont pas appelés après un refus.

### R3 — Isolation du tenant

Le tenant autorisé provient du contexte vérifié et non d'un identifiant global fourni par l'appelant.

**Acceptation :** un test IDOR inter-tenant échoue avant tout effet et produit un événement d'audit expurgé.

### R4 — Adaptateur tRPC optionnel

Le sous-chemin `/trpc` convertit les erreurs et métadonnées sans modifier le kernel.

**Acceptation :** le root fonctionne sans `@trpc/server`; le contract test tRPC vérifie contexte et ordre des middlewares.

### R5 — État optimiste déterministe

Le sous-chemin `/state` est indépendant de toute bibliothèque UI.

**Acceptation :** succès, rejet, concurrence, doublon et réponse hors ordre ont des tests déterministes.

### R6 — Distribution sûre

Chaque export est déclaré explicitement et les modules non publics restent inaccessibles.

**Acceptation :** `npm pack --dry-run`, `publint`, contrôle des types et fixtures ESM/CJS passent sur le tarball.

### R7 — Publication traçable

La publication cible utilise un workflow GitHub Actions dédié et une relation de confiance npm OIDC.

**Acceptation :** un environnement protégé approuve la release, le job de publication possède seulement `contents: read` et `id-token: write`, et aucune clé npm longue durée n'est présente.

## Exigences non fonctionnelles

- TypeScript strict, `exactOptionalPropertyTypes` et `noUncheckedIndexedAccess`.
- Zéro secret ou donnée personnelle dans erreurs, logs, snapshots et fakes.
- Aucun effet à l'import ; bundles tree-shakeable et `sideEffects: false` vérifié.
- 100 % de couverture de branches pour les décisions de `security`; seuil global minimal de 90 %.
- Temps de test local cible inférieur à 30 secondes hors fixtures consommateurs.
- API publique documentée, versionnée SemVer et accompagnée d'un changelog avant 1.0.

## Métriques, guardrails et sortie bêta

Les métriques de lancement sont : taux de contract tests réussis, défauts d'autorisation, régressions d'API publique, échecs de rollback optimistic et taux d'installation depuis tarball. Aucun identifiant utilisateur brut ne doit être utilisé dans la télémétrie.

La bêta peut se terminer lorsque deux shells indépendants passent leurs tests d'intégration, qu'aucun défaut critique d'autorisation n'est ouvert, qu'une restauration de version npm a été répétée, et que deux releases candidates consécutives passent tous les gates sans exception manuelle.
