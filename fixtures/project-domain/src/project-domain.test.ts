import { type AccessGrant, PermissionSchema } from "@messanga11/core/server";
import { createTestContext, createTestPorts } from "@messanga11/core/testing";
import { describe, expect, it } from "vitest";
import {
  createInMemoryProjectRepository,
  createProjectAuthorizationPort,
  createProjectOperations,
  PROJECT_ACTIONS,
  type ProjectPermission,
} from "./index";

const PERMISSIONS = PROJECT_ACTIONS.map(
  (action) => `project:${action}` as ProjectPermission,
);

describe("project protected vertical", () => {
  it("creates and renames a tenant-scoped project with authoritative uiMeta", async () => {
    const repository = createInMemoryProjectRepository();
    const { ports } = createTestPorts({
      authorization: createProjectAuthorizationPort(PERMISSIONS),
    });
    const operations = createProjectOperations({
      grantedPermissions: PERMISSIONS,
      ports,
      repository,
      resourceScope: { authorize: async () => ({ allowed: true }) },
    });
    const created = await operations.create.execute({
      context: createTestContext(),
      input: { id: "project:1", idempotencyKey: "create:1", name: "Alpha" },
    });

    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    expect(created.data.uiMeta.allowedActions.rename.status).toBe("allowed");

    const renamed = await operations.rename.execute({
      context: projectContext("project:1"),
      input: {
        expectedVersion: 1,
        id: "project:1",
        idempotencyKey: "rename:1",
        name: "Beta",
      },
    });

    expect(renamed).toMatchObject({
      data: {
        data: { project: { name: "Beta", version: 2 }, status: "updated" },
      },
      ok: true,
    });
  });

  it("returns a conflict and replays the same idempotent mutation", async () => {
    const runtime = await createRuntimeWithProject();
    const conflictInput = {
      expectedVersion: 99,
      id: "project:1",
      idempotencyKey: "rename:conflict",
      name: "Ignored",
    };

    const first = await runtime.operations.rename.execute({
      context: projectContext("project:1"),
      input: conflictInput,
    });
    const replay = await runtime.operations.rename.execute({
      context: projectContext("project:1"),
      input: conflictInput,
    });

    expect(first).toMatchObject({
      data: { data: { status: "conflict" } },
      ok: true,
    });
    expect(replay).toEqual(first);
  });

  it("reads, archives, and replays a mutation without advancing twice", async () => {
    const runtime = await createRuntimeWithProject();
    const read = await runtime.operations.get.execute({
      context: projectContext("project:1"),
      input: { id: "project:1" },
    });
    const input = {
      expectedVersion: 1,
      id: "project:1",
      idempotencyKey: "archive:1",
    };
    const archived = await runtime.operations.archive.execute({
      context: projectContext("project:1"),
      input,
    });
    const replay = await runtime.operations.archive.execute({
      context: projectContext("project:1"),
      input,
    });

    expect(read).toMatchObject({ data: { data: { name: "Alpha" } }, ok: true });
    expect(archived).toMatchObject({
      data: {
        data: {
          project: { status: "archived", version: 2 },
          status: "updated",
        },
      },
      ok: true,
    });
    expect(replay).toEqual(archived);
  });

  it("replays creation and denies permissions outside the project policy", async () => {
    const repository = createInMemoryProjectRepository();
    const authorization = createProjectAuthorizationPort(PERMISSIONS);
    const { ports } = createTestPorts({ authorization });
    const operations = createProjectOperations({
      grantedPermissions: PERMISSIONS,
      ports,
      repository,
      resourceScope: { authorize: async () => ({ allowed: true }) },
    });
    const execution = {
      context: createTestContext(),
      input: { id: "project:1", idempotencyKey: "create:1", name: "Alpha" },
    };

    const first = await operations.create.execute(execution);
    const replay = await operations.create.execute(execution);
    const denied = await authorization.authorize({
      context: createTestContext(),
      permission: PermissionSchema.parse("tenant:manage"),
    });

    expect(replay).toEqual(first);
    expect(denied).toEqual({ allowed: false });
  });

  it("returns a safe refusal when a scoped project does not exist", async () => {
    const runtime = await createRuntimeWithProject();
    const result = await runtime.operations.get.execute({
      context: projectContext("project:missing"),
      input: { id: "project:missing" },
    });

    expect(result).toMatchObject({ error: { code: "FORBIDDEN" }, ok: false });
  });

  it("rejects a resource identifier that differs from the protected context", async () => {
    const runtime = await createRuntimeWithProject();
    const result = await runtime.operations.rename.execute({
      context: projectContext("project:other"),
      input: {
        expectedVersion: 1,
        id: "project:1",
        idempotencyKey: "rename:idor",
        name: "Forbidden",
      },
    });

    expect(result).toMatchObject({ error: { code: "FORBIDDEN" }, ok: false });
  });

  it("rejects direct repository writes with a forged grant", async () => {
    const repository = createInMemoryProjectRepository();
    const forged = {
      actorId: "actor:test",
      permission: "project:create",
      tenantId: "tenant:test",
    } as unknown as AccessGrant;

    await expect(
      repository.create(
        { id: "project:1", idempotencyKey: "create:1", name: "Alpha" },
        forged,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

function projectContext(projectId: string) {
  return createTestContext({
    resource: { id: projectId, type: "project" },
  });
}

async function createRuntimeWithProject() {
  const repository = createInMemoryProjectRepository();
  const { ports } = createTestPorts({
    authorization: createProjectAuthorizationPort(PERMISSIONS),
  });
  const operations = createProjectOperations({
    grantedPermissions: PERMISSIONS,
    ports,
    repository,
    resourceScope: { authorize: async () => ({ allowed: true }) },
  });
  await operations.create.execute({
    context: createTestContext(),
    input: { id: "project:1", idempotencyKey: "create:1", name: "Alpha" },
  });
  return { operations, repository };
}
