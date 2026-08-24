# Processus de livraison

## Principes

Chaque incrément est vertical, petit et publiable. Il inclut contrat, politique, implémentation, tests, observabilité et rollback. Les changements adjacents non requis restent hors du diff.

Avant de coder, l'agent utilise `rg` pour trouver le motif existant le plus proche et lit uniquement le micro-contexte utile. Pour trois fichiers ou plus, il publie un plan avec un critère de vérification par étape.

## Séquence de livraison

1. Créer une branche `feature/<capability>` et écrire le critère d'acceptation.
2. Rechercher les contrats et motifs voisins ; enregistrer les décisions nouvelles dans un ADR si elles sont durables.
3. Écrire le test qui reproduit le besoin ou la violation de frontière.
4. Implémenter le minimum, sans nouveau fournisseur ni abstraction spéculative.
5. Exécuter format/lint, typecheck, tests, couverture, build et validation du package.
6. Inspecter `git diff` et `git status`; retirer seulement les orphelins créés par le changement.
7. Obtenir une revue de code et, pour sécurité/API publique, une revue spécialisée.

## Incréments planifiés

| Version | Incrément | Preuve attendue |
| --- | --- | --- |
| 0.2 | Packaging et frontières | Smoke tests de cinq exports, deep import refusé |
| 0.3 | Contrats root Zod 4 | Tests runtime et de types |
| 0.4 | Runtime server fail-closed | Suite négative complète |
| 0.5 | Adaptateur tRPC 11 | Contract tests avec caller |
| 0.6 | Moteur state optimistic | Tests concurrence et hors ordre |
| 0.7 | Testing kit et pilote | Deux fixtures consommatrices |
| 0.9 | Gel de l'API candidate | Rapport API/SemVer et release candidate |
| 1.0 | Publication stable | Canary, provenance et rollback répété |

## Gates CI

La CI GitHub Actions utilise des permissions minimales et bloque le merge si un gate échoue :

1. installation reproductible avec lockfile ;
2. Biome et ESLint, incluant frontières et imports interdits ;
3. TypeScript strict ;
4. tests unitaires, contract tests et tests négatifs de sécurité ;
5. seuils de couverture ;
6. build ESM/CJS et déclarations par sous-chemin ;
7. `npm pack --dry-run`, `publint` et analyse des types publiés ;
8. installation du tarball dans des fixtures ESM et CJS ;
9. scan de secrets et audit de dépendances selon une politique de sévérité ;
10. contrôle du diff d'API publique et classification SemVer.

Les tests tRPC ne s'exécutent qu'avec le peer installé, mais leur absence n'autorise jamais la publication de `/trpc`. Les actions GitHub tierces sont épinglées à un SHA ou à une politique approuvée.

## Revue

Une revue vérifie le comportement et les frontières, pas seulement le style. Une modification de preuve, permission, tenant, erreur publique, export, peer dependency ou workflow de release exige deux approbations, dont Security & QA pour les quatre premiers cas.

Les exceptions CI sont interdites sur `main`. Un test flaky est corrigé ou mis en quarantaine avec propriétaire et échéance ; il ne devient pas un succès implicite.

## Definition of Done

Un changement est terminé lorsque :

- ses critères d'acceptation sont couverts et passent ;
- les erreurs, entrées invalides et récupérations sont testées ;
- les frontières d'import et la compatibilité des exports sont vérifiées ;
- aucun secret, PII, deep import ou type fournisseur ne fuit ;
- les changements d'API ont une décision SemVer et une note de migration ;
- les documents durables reflètent toute décision nouvelle ;
- le tarball, et non seulement `src`, passe les fixtures consommatrices ;
- le rollback est défini pour tout changement de publication ou d'adaptateur ;
- le diff est limité au besoin et approuvé.

## Release et publication

Une release est produite depuis un tag protégé après les mêmes gates que la PR. Le job de publication est séparé du build, télécharge l'artefact immuable validé et utilise un environnement GitHub protégé.

La cible est npm Trusted Publishing par OIDC : pas de token npm longue durée ; permissions du job limitées à `contents: read` et `id-token: write`. La documentation npm indique que le trusted publishing requiert actuellement un runner cloud pris en charge et des versions minimales de Node/npm ; ces prérequis sont vérifiés au moment de créer le workflow, pas figés ici. Voir [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) et [GitHub OIDC](https://docs.github.com/en/actions/reference/security/oidc).
