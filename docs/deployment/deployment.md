# Déploiement et publication

## Nature de l'artefact

`@messanga11/core` ne déploie aucun service, domaine, port réseau, base ou volume. Son artefact de production est un tarball npm public contenant uniquement les builds et déclarations explicitement exportés. Les applications consommatrices possèdent leur propre topologie.

## Topologie de livraison

```text
pull request → CI read-only → artefact tarball immuable
                         ↓
tag protégé → environnement GitHub `npm-production` → OIDC npm → registre public
```

Le job de build ne publie pas. Le job de publication réutilise exactement l'artefact validé, sur un runner GitHub-hosted compatible avec npm Trusted Publishing.

## Secrets et permissions

- CI : `contents: read` seulement.
- Publication : `contents: read` et `id-token: write`, au niveau du job.
- Aucun `NPM_TOKEN` de publication longue durée.
- L'environnement `npm-production` peut imposer une approbation et limite les tags autorisés.
- Les forks et pull requests non fiables ne reçoivent aucun secret ni droit OIDC de publication.
- Les claims de confiance npm lient exactement `Messanga11/core`, le nom du workflow et, si retenu, l'environnement.

La configuration OIDC npm est une action externe non réalisée par ce blueprint. La documentation officielle précise les prérequis actuels, la provenance automatique et les limites des runners pris en charge : [Trusted publishing for npm packages](https://docs.npmjs.com/trusted-publishers/). GitHub documente que `id-token: write` autorise la demande d'un jeton OIDC sans accorder par lui-même l'écriture sur une ressource : [OpenID Connect reference](https://docs.github.com/en/actions/reference/security/oidc).

## Images, ports, variables et volumes

Aucune image de production, port privé ou volume n'est requis pour le package. Les outils du workflow sont épinglés selon la politique du dépôt et Node/npm respectent les prérequis OIDC vérifiés au moment de l'implémentation.

Variables non secrètes prévues : version de Node, registre npm, nom de package et nom d'environnement. Les credentials OIDC sont éphémères et fournis par GitHub ; ils ne sont ni persistés ni journalisés.

## Build immuable et contrôles

Le build d'une release part d'un lockfile propre. Son tarball est construit une fois, reçoit un checksum, puis est utilisé pour :

- inspection du contenu autorisé ;
- validation ESM/CJS et déclarations ;
- installation dans les fixtures ;
- scan de dépendances et de secrets ;
- publication sans reconstruction.

La provenance npm est attendue pour une publication OIDC depuis le dépôt public, mais doit être vérifiée sur la page de la version avant promotion générale.

## Health, métriques et observabilité

Il n'existe pas de health endpoint. La santé de livraison est mesurée par les gates CI, le succès de publication, l'installation du tarball, la présence de provenance et les smoke tests d'un consommateur propre.

Les applications mesurent séparément erreurs d'autorisation, latence des ports et rollbacks optimistic. Le package n'envoie aucune télémétrie automatiquement.

## Sauvegarde et restauration

Le code source Git, les tags protégés, les artefacts CI avec rétention définie et les versions immuables du registre constituent les copies. Une release conserve le tarball et son checksum hors du workspace du runner.

Le test de restauration consiste à partir d'un environnement vide, télécharger le tarball approuvé, vérifier son checksum, l'installer dans les fixtures et exécuter les smoke tests. Cette répétition est requise avant 1.0 et périodiquement ensuite.

## Déploiement, promotion et rollback

1. Tag candidate signé/protégé après CI verte.
2. Build et validation de l'artefact immuable.
3. Approbation de l'environnement de publication.
4. Publication OIDC sous un dist-tag de canary ou `next`.
5. Smoke tests d'installation depuis le registre.
6. Promotion du dist-tag stable après observation.

Une version npm publiée n'est jamais remplacée. Le rollback repointe le dist-tag stable vers la dernière version saine et publie rapidement une version corrective si nécessaire. Les consommateurs peuvent revenir à la version verrouillée précédente. Une révocation/deprecation de version compromise suit l'incident runbook et évite `unpublish` sauf nécessité de sécurité et politique npm applicable.

## Checklist production

- Tous les gates CI et tarball passent.
- Version et changelog correspondent ; aucun changement d'API non classé.
- Trusted Publisher npm configuré sur le workflow exact.
- Environnement, tags et permissions GitHub protégés.
- Aucun secret longue durée ni fichier inattendu dans le tarball.
- Provenance et repository metadata vérifiables.
- Canary installé par les deux fixtures.
- Procédure de restauration et rollback répétée.
- Responsable d'incident et canal de communication identifiés.
