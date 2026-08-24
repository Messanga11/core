# Frontières technologiques

## Principe

La direction est toujours `module → port stable du projet → adaptateur privé → technologie fournisseur`. Les types fournisseur ne traversent jamais un contrat public. La sélection d'adaptateur se fait dans le composition root du consommateur.

## Matrice des frontières

| Capacité | API/package stable | Adaptateur initial privé | Remplacements possibles | État |
| --- | --- | --- | --- | --- |
| Validation | Schémas de `@messanga11/core/server` | Zod 4 | Nouvelle majeure derrière migration explicite | Opérationnel |
| Runtime serveur | `@messanga11/core/server` | Ports injectés | Tout adaptateur conforme | Opérationnel |
| Transport RPC | `@messanga11/core/trpc` | tRPC 11 en peer optionnel | Appel direct `/server`, futur adaptateur HTTP | Opérationnel |
| État optimiste | `@messanga11/core/state` | Réducteur pur interne | Store du shell, sans fuite dans le contrat | Opérationnel |
| Identité | `AuthenticatedRequestContext` | Résolue avant l'entrée kernel | OIDC, session interne, fournisseur géré | Propriété du consommateur |
| Autorisation | `AuthorizationPort` | Aucun dans le package | Moteur maison ou policy engine | Propriété du consommateur |
| Rate limit/quota | `RateLimitPort`, `QuotaPort` | Fakes uniquement en test | Redis, SQL, service externe | Propriété du consommateur |
| Persistance | Ports métier futurs | Aucun ORM | SQL, document, API distante | Hors MVP |
| Télémétrie/audit | `AuditPort`, `InternalErrorReporterPort` | Collecteurs mémoire dans `/testing` | OpenTelemetry ou fournisseur | Propriété du consommateur |
| Query/network client | Contrats et résultats root | Aucun | Client tRPC ou HTTP dans le shell | Hors package |
| Forms/design system/navigation | Aucun | Aucun | Technologies du shell | Hors package |
| Object storage/queue/AI | Aucun tant qu'un domaine ne le justifie | Aucun | Adaptateurs futurs | Non requis |

## Règles d'import

- `root` n'importe que ses modules internes universels.
- `state` peut importer `root`, jamais `server`, `trpc` ou `testing`.
- `policy` et `events` peuvent importer les contrats universels, jamais un adaptateur ou une plateforme.
- `server` peut importer `root`, jamais `trpc`, `state` ou `testing`.
- `trpc` peut importer `root`, `server` et `@trpc/server` 11.
- `testing` peut importer `root`, `server` et `state`; aucune source de production ne l'importe.
- Aucun module n'importe React, DOM, React Native, ORM, SDK d'identité ou SDK de télémétrie.
- Les consommateurs importent les sous-chemins publics ; les deep imports vers `dist` ou `src` sont interdits.

Ces règles doivent être contrôlées par lint, analyse de dépendances et smoke tests du tarball, pas seulement par convention.

## Politique d'exports

Chaque sous-chemin possède une entrée et des déclarations distinctes. Le root ne ré-exporte ni `/policy`, ni `/events`, ni `/server`, ni `/trpc`, ni `/testing`. Le package déclare les exports autorisés sans wildcard. Un import d'un chemin interne doit échouer dans une fixture consommateur.

Le peer tRPC est optionnel au niveau du package, mais obligatoire et contrôlé lors de l'import de `/trpc`. Une application qui n'utilise que le root, `/state` ou `/server` doit pouvoir installer et exécuter le package sans tRPC.

## Test d'acceptation d'un remplacement

Une technologie peut être remplacée seulement si :

1. aucun module métier ou contrat public n'est modifié ;
2. aucun type, code d'erreur ou objet fournisseur n'apparaît dans l'API publique ;
3. les contract tests du port passent contre le nouvel adaptateur ;
4. les tests négatifs d'autorisation et de tenant passent ;
5. les fixtures ESM/CJS et le test vertical pilote passent depuis le tarball ;
6. la stratégie de rollback de l'adaptateur est documentée et répétée.

## Exceptions

Une exception requiert un ADR daté, un propriétaire, une échéance de suppression et un test qui matérialise son périmètre. Une dépendance optionnelle ou un cast TypeScript n'est pas une autorisation de franchir une frontière.
