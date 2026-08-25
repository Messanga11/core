# Démarrer avec `@messanga11/core` depuis GitHub

## Prérequis

- Node.js 22 ou plus récent ;
- un projet TypeScript ESM ;
- aucun token GitHub ou npm.

## Installation

Dans un nouveau dossier :

```sh
npm init -y
npm pkg set type=module
npm install --save-exact https://github.com/Messanga11/core/releases/download/core-v0.4.0/messanga11-core-0.4.0.tgz
npm install zod
npm install --save-dev typescript tsx @types/node
```

La dépendance enregistrée dans `package.json` reste l'URL exacte de la release. Le
`package-lock.json` verrouille en plus son intégrité. Il doit être commité.

Crée `tsconfig.json` :

```json
{
  "compilerOptions": {
    "exactOptionalPropertyTypes": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "noUncheckedIndexedAccess": true,
    "outDir": "dist",
    "strict": true,
    "target": "ES2022"
  },
  "include": ["src"]
}
```

## Première opération protégée

Crée `src/index.ts` :

```ts
import { z } from "zod";
import { createProtectedOperation } from "@messanga11/core/server";
import {
  createTestContext,
  createTestPorts,
} from "@messanga11/core/testing";

const { ports } = createTestPorts();

const readProfile = createProtectedOperation({
  name: "profile.read",
  kind: "query",
  permission: "profile:read",
  schema: z.object({ profileId: z.string().min(1) }).strict(),
  ports,
  handler: async ({ profileId }, { access }) => ({
    profileId,
    tenantId: access.tenantId,
  }),
});

const result = await readProfile.execute({
  context: createTestContext(),
  input: { profileId: "profile:1" },
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
```

Lance l'exemple :

```sh
npx tsx src/index.ts
```

`@messanga11/core/testing` sert uniquement au prototype local et aux tests. En
production, remplace ses ports par tes adaptateurs d'identité, d'autorisation,
de quota, de rate limit, d'audit et de persistance.

## Connexion à tRPC

Installe le peer optionnel :

```sh
npm install @trpc/server
```

Déplace et exporte d'abord `readProfile` depuis `src/profile.ts`, puis expose
l'opération :

```ts
import { createCoreTRPC } from "@messanga11/core/trpc";
import { readProfile } from "./profile.js";

const trpc = createCoreTRPC();

export const appRouter = trpc.router({
  profile: trpc.router({
    read: trpc.guardedQuery(readProfile),
  }),
});

export type AppRouter = typeof appRouter;
```

Le contexte tRPC doit transmettre un `requestContext` authentifié construit côté
serveur. Un `tenantId` reçu directement du formulaire ou du corps HTTP ne constitue
jamais une preuve d'accès.

## Mettre à jour ou revenir en arrière

Pour changer de version, remplace à la fois le tag et le nom du tarball :

```sh
npm install --save-exact https://github.com/Messanga11/core/releases/download/core-v0.4.0/messanga11-core-0.4.0.tgz
```

Le rollback utilise exactement la même commande avec la version précédente. Les
fichiers `SHA256SUMS` et SBOM sont joints à chaque GitHub Release.
