# Plan de lancement

## Préconditions

Le lancement concerne la bibliothèque npm, pas une application déployée. Aucun document ne remplace une validation runtime. Le workflow OIDC existe ; le Trusted Publisher npm, les protections de l'environnement GitHub et le pilote consommateur restent à configurer et à vérifier.

## Checklists de lancement

### Produit

- Les sept sous-chemins du kernel correspondent au périmètre PRD.
- Un domaine pilote démontre contrats, protection serveur et état optimistic.
- Les non-objectifs restent absents du package.
- Les exemples utilisent exclusivement l'API publique.

### Qualité

- Lint, frontières, typecheck, tests, couverture, build et validation du tarball passent.
- ESM, CJS et déclarations sont testés depuis un projet vide.
- Aucun test flaky ou exception CI sans échéance.
- Le changelog et la migration SemVer sont relus.

### Sécurité et privacy

- La matrice négative session/tenant/permission/IDOR/preuve passe à 100 %.
- Aucun secret, token, PII ou source map non voulue dans tarball, logs et erreurs.
- Le workflow OIDC a les permissions minimales et un environnement protégé.
- L'audit du pilote est expurgé ; la rétention et la suppression relèvent du consommateur.
- Le package n'émet aucune télémétrie ni donnée privée par défaut.

### Fiabilité et intégration

- Le peer tRPC 11 absent n'affecte pas root/server/state.
- Le peer installé passe les contract tests `/trpc`.
- Les scénarios de port indisponible et rollback optimistic passent.
- La restauration du tarball et le rollback du dist-tag ont été répétés.
- Provenance, repository et checksum sont vérifiés après publication canary.

## Phases de rollout

1. **Interne** : installation depuis tarball local dans les fixtures ; aucune publication.
2. **Canary registre** : version prerelease sous dist-tag `next`, consommée uniquement par un shell pilote.
3. **Canary élargi** : second shell indépendant, période d'observation et comparaison des erreurs.
4. **Bêta** : API candidate gelée, migrations documentées, feedback d'intégrateurs.
5. **Disponibilité générale** : version 1.0 sous dist-tag stable après critères de sortie.

Chaque phase exige les checklists applicables et une décision explicite de promotion. Le temps d'observation exact sera fixé selon la cadence réelle des shells.

## Conditions d'arrêt automatique

- Accès non autorisé, IDOR inter-tenant ou preuve forgeable.
- Secret ou donnée privée dans l'artefact, la provenance, un log ou une erreur.
- Corruption d'état ou rollback optimistic qui écrase une opération confirmée plus récente.
- Fuite de tRPC/server dans le bundle root ou state.
- Régression d'API publique non classée ou incompatibilité de types consommateur.
- Artefact publié différent de l'artefact testé, provenance absente ou checksum incohérent.
- Taux d'échec d'installation ou de tests du pilote supérieur à zéro pendant la canary.

Un arrêt bloque toute promotion et repointe le dist-tag vers la dernière version saine si une version est déjà visible.

## Incident runbook

1. Nommer un incident commander et horodater l'ouverture.
2. Stopper publication et promotion ; préserver logs, checksum, tarball, commit et claims non sensibles.
3. Déterminer versions, consommateurs, tenants et actions affectés sans exposer de PII.
4. Pour un risque actif, repointer le dist-tag, avertir les consommateurs de verrouiller/revenir à la version saine et révoquer toute confiance compromise.
5. Reproduire dans une fixture isolée, corriger avec un test de non-régression et publier une nouvelle version ; ne jamais réécrire une version existante.
6. Valider en interne, puis canary, avant toute promotion.
7. Communiquer uniquement les faits confirmés, l'impact, la mitigation et la prochaine mise à jour.

## Modèle de post-mortem blameless

- Résumé et impact observable.
- Chronologie factuelle : détection, arrêt, mitigation, restauration.
- Conditions techniques et organisationnelles contributrices, sans attribution individuelle.
- Pourquoi les tests, reviews ou alertes n'ont pas arrêté l'incident.
- Ce qui a réduit l'impact.
- Actions mesurables avec propriétaire, priorité, échéance et preuve de clôture.
- Modification requise des gates, contrats, runbooks ou objectifs.

## Critères de sortie bêta

Deux shells indépendants passent depuis le registre, deux candidates consécutives sont sans stop condition, tous les défauts critiques/hauts sont fermés, la sécurité et la privacy ont leur approbation, et les procédures OIDC, restauration, rollback et incident ont une preuve datée.
