# Authentification et autorisation

## Portée et état

Le kernel ne connecte aucun utilisateur et ne stocke aucune session. Le consommateur apporte un `AuthenticatedRequestContext` strictement validé ; le pipeline opérationnel délivre ensuite un `AccessGrant` interne après tous les contrôles.

## Authentification et sessions

L'authentification concrète reste chez le serveur consommateur. Aucun token, cookie ou claim fournisseur n'entre dans le contrat public ; seul le contexte normalisé acteur/request/tenant/ressource franchit la frontière du kernel.

Expiration, révocation, suspension, logout, récupération, MFA et stockage de session restent chez le fournisseur/consommateur. Celui-ci ne construit le contexte authentifié qu'après ces vérifications et peut renforcer une opération sensible dans son `AuthorizationPort`.

Pour une application web BFF, le consommateur doit conserver ses tokens serveur-side, protéger ses cookies et appliquer sa défense CSRF. Pour un client public, le protocole et le stockage sécurisé restent hors du kernel.

## Tenant, memberships et invitations

Le vocabulaire canonique est `tenant`. `AuthorizationPort` vérifie l'adhésion active entre acteur et tenant ; `ResourceScopePort` vérifie séparément la ressource. Toute ressource cliente persistée possède un `tenantId` non nul. L'identifiant fourni par l'appelant ne remplace jamais l'appartenance vérifiée.

Le kernel ne gère pas encore le cycle de vie des invitations. Si un domaine l'ajoute, les invitations doivent être aléatoires, stockées sous forme de hash, à usage unique, expirables et limitées aux permissions que l'invitant peut déléguer. Le dernier propriétaire d'un tenant ne peut être retiré et le transfert/suppression exige une opération dédiée auditée.

## Permissions, rôles et politiques contextuelles

Les permissions sont des chaînes namespacées, par exemple `project:read` ou `project:manage`. Les services autorisent une permission et un contexte de ressource, jamais la visibilité UI ou le nom brut d'un rôle.

Matrice de rôles par défaut à adapter dans le domaine consommateur :

| Permission | Owner | Admin | Member | Viewer | Service identity |
| --- | ---: | ---: | ---: | ---: | ---: |
| `tenant:read` | Oui | Oui | Oui | Oui | Selon scope |
| `tenant:manage` | Oui | Oui | Non | Non | Non |
| `membership:manage` | Oui | Oui | Non | Non | Non |
| `resource:read` | Oui | Oui | Oui | Oui | Selon scope |
| `resource:write` | Oui | Oui | Oui | Non | Selon scope |
| `tenant:transfer` | Oui | Non | Non | Non | Non |
| `tenant:delete` | Oui | Non | Non | Non | Non |

Les rôles facilitent l'administration ; `AuthorizationPort` évalue la permission effective, l'appartenance de la ressource et les préconditions contextuelles. Une identité de service possède un type distinct, un tenant et des scopes minimaux ; elle ne peut hériter implicitement d'un rôle humain.

## Ordre fail-closed

L'ordre normatif est :

1. valider le contexte authentifié, son acteur et son tenant ;
2. vérifier la permission et l'adhésion via `AuthorizationPort` ;
3. vérifier l'appartenance de la ressource via `ResourceScopePort` lorsqu'elle est requise ;
4. valider l'entrée avec le schéma Zod de l'opération ;
5. réserver atomiquement le quota ;
6. appliquer le rate limiting ;
7. enregistrer l'intention avant toute mutation ;
8. créer l'`AccessGrant` opaque et appeler le handler ;
9. commit/release du quota puis audit du résultat.

Une erreur, exception, timeout, résultat inconnu ou port non configuré produit un refus. Seul le module serveur crée la preuve. Le service vérifie sa provenance à l'exécution avant tout effet.

## Défense IDOR et `uiMeta`

Les recherches d'adaptateur utilisent le `tenantId` vérifié avec l'identifiant de ressource. Une recherche globale puis comparaison tardive est interdite. Les erreurs publiques ne distinguent pas « inexistant » de « appartient à un autre tenant » lorsqu'une distinction révélerait une ressource.

`uiMeta.allowedActions` et ses raisons sont calculés depuis la même décision de policy que l'autorisation. Cacher une action dans l'UI n'accorde ni ne retire une permission et ne remplace aucun contrôle serveur.

## Secrets, données et audit

- Aucun secret, token, cookie, lien d'invitation, donnée d'entrée sensible ou stack trace dans les logs et erreurs publiques.
- Les adaptateurs stockent les secrets chiffrés et les exposent uniquement au service qui les utilise.
- Les événements d'audit couvrent authentification refusée, membership suspendue, permission refusée, IDOR, changement de privilège, action sensible et panne d'adaptateur.
- L'audit contient des identifiants opaques/corrélables, une permission, un résultat et une raison stable ; sa rétention et suppression sont définies par le consommateur.
- Le kernel ne collecte aucune donnée personnelle par défaut. Les fakes utilisent uniquement des identités synthétiques.

## Tests de sécurité négatifs obligatoires

- Absence, expiration et révocation de session.
- Membership absente ou suspendue.
- Permission absente et cache de permission obsolète.
- IDOR inter-tenant et identifiant de tenant injecté.
- Ressource supprimée entre contrôle et effet.
- Preuve absente, forgée, réutilisée avec un autre tenant ou expirée.
- Port qui throw, timeout ou retourne une valeur inconnue.
- Rate limit et quota concurrents.
- Bypass par `uiMeta`, appel direct du service et procédure tRPC mal configurée.
- Identité de service hors scope.
- Rejeu d'invitation si ce domaine est introduit.

La couverture de branches des décisions de sécurité est de 100 %. Les tests confirment aussi que le handler et les gardes ultérieures ne s'exécutent jamais après un refus.

## Revue et réponse

Toute évolution du vocabulaire de permission, de la preuve, de l'ordre des gardes ou des erreurs publiques nécessite une revue Security & QA, un test négatif et une décision SemVer. Un défaut d'accès inter-tenant ou une preuve forgeable bloque immédiatement publication et lancement.
