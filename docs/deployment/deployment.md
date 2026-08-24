# Déploiement et publication

## Nature de l'artefact

`@messanga11/core` ne déploie aucun service, domaine, port réseau, base ou volume. Son artefact de production est un tarball installable par npm, joint à une GitHub Release publique et contenant uniquement les builds et déclarations explicitement exportés. Les applications consommatrices possèdent leur propre topologie.

## Topologie de livraison

```text
pull request → CI read-only → artefact tarball immuable
                         ↓
GitHub Release → tarball + SBOM + SHA-256 → téléchargement public sans token
```

Le workflow de release reconstruit depuis le tag, répète tous les gates puis joint
le tarball validé, son SBOM et ses checksums à la GitHub Release. La publication
npm reste un canal futur séparé, bloqué jusqu'à la configuration du Trusted
Publisher.

## Secrets et permissions

- CI : `contents: read` seulement.
- Release GitHub : `contents: write` uniquement au niveau du job d'upload.
- Aucun `NPM_TOKEN` de publication longue durée.
- Les forks et pull requests non fiables ne reçoivent aucun droit d'écriture.
- Le projet consommateur télécharge une ressource publique et ne stocke aucun token.

Le `GITHUB_TOKEN` éphémère du workflow n'est utilisé que pour joindre les assets à
la release. Il n'est ni transmis au tarball ni requis par les consommateurs.

## Images, ports, variables et volumes

Aucune image de production, port privé ou volume n'est requis pour le package. Les outils du workflow sont épinglés selon la politique du dépôt.

Variables non secrètes prévues : version de Node, tag GitHub et nom de package.

## Build immuable et contrôles

Le build d'une release part d'un lockfile propre. Son tarball est construit une fois, reçoit un checksum, puis est utilisé pour :

- inspection du contenu autorisé ;
- validation ESM/CJS et déclarations ;
- installation dans les fixtures ;
- scan de dépendances et de secrets ;
- ajout à la GitHub Release sans modification.

Le fichier `SHA256SUMS` couvre le tarball et son SBOM CycloneDX.

## Health, métriques et observabilité

Il n'existe pas de health endpoint. La santé de livraison est mesurée par les gates CI, l'upload des assets, l'installation du tarball et les smoke tests d'un consommateur propre.

Les applications mesurent séparément erreurs d'autorisation, latence des ports et rollbacks optimistic. Le package n'envoie aucune télémétrie automatiquement.

## Sauvegarde et restauration

Le code source Git, les tags protégés et les assets immuables de la GitHub Release constituent les copies. Une release conserve le tarball, son SBOM et ses checksums hors du workspace du runner.

Le test de restauration consiste à partir d'un environnement vide, télécharger le tarball approuvé, vérifier son checksum, l'installer dans les fixtures et exécuter les smoke tests. Cette répétition est requise avant 1.0 et périodiquement ensuite.

## Déploiement, promotion et rollback

1. Tag candidate signé/protégé après CI verte.
2. Build et validation de l'artefact immuable.
3. Création d'une GitHub Release `core-vX.Y.Z`.
4. Upload automatique du tarball, du SBOM et des checksums.
5. Smoke test d'installation depuis l'URL publique.

Une release publiée n'est jamais remplacée silencieusement. Une correction reçoit
une nouvelle version. Le rollback réinstalle l'URL exacte de la dernière version
saine et régénère le lockfile du projet consommateur.

## Checklist production

- Tous les gates CI et tarball passent.
- Version et changelog correspondent ; aucun changement d'API non classé.
- Tag et permissions GitHub protégés.
- Aucun secret longue durée ni fichier inattendu dans le tarball.
- Checksum, SBOM et repository metadata vérifiables.
- Canary installé par les deux fixtures.
- Procédure de restauration et rollback répétée.
- Responsable d'incident et canal de communication identifiés.
