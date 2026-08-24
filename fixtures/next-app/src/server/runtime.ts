import { createCoreTRPC } from "@messanga11/core/trpc";
import {
  createInMemoryProjectRepository,
  createProjectAuthorizationPort,
  createProjectOperations,
  PROJECT_ACTIONS,
  type ProjectPermission,
} from "@messanga11/project-fixture";

const permissions = PROJECT_ACTIONS.map(
  (action) => `project:${action}` as ProjectPermission,
);
const repository = createInMemoryProjectRepository();
const authorization = createProjectAuthorizationPort(permissions);
const ports = {
  audit: { record: async () => undefined },
  authorization,
  clock: { now: () => new Date() },
  quota: {
    reserve: async () => ({
      allowed: true as const,
      reservation: {
        commit: async () => undefined,
        release: async () => undefined,
      },
    }),
  },
  rateLimit: { consume: async () => ({ allowed: true as const }) },
  reporter: { report: () => undefined },
};
const operations = createProjectOperations({
  grantedPermissions: permissions,
  ports,
  repository,
  resourceScope: { authorize: async () => ({ allowed: true }) },
});
const trpc = createCoreTRPC();

export const appRouter = trpc.router({
  project: trpc.router({
    archive: trpc.guardedMutation(operations.archive),
    create: trpc.guardedMutation(operations.create),
    get: trpc.guardedQuery(operations.get),
    rename: trpc.guardedMutation(operations.rename),
  }),
});

export type AppRouter = typeof appRouter;
