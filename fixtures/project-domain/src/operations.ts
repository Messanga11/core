import type { OperationEnvelope } from "@messanga11/core";
import type { PolicyDenialCode } from "@messanga11/core/policy";
import {
  CoreError,
  createProtectedOperation,
  type ProtectedOperationPorts,
  type ResourceScopePort,
} from "@messanga11/core/server";
import {
  ArchiveProjectInputSchema,
  CreateProjectInputSchema,
  GetProjectInputSchema,
  type Project,
  type ProjectMutationResult,
  RenameProjectInputSchema,
} from "./model";
import {
  buildProjectUiMeta,
  type ProjectAction,
  type ProjectPermission,
} from "./policy";
import type { ProjectRepository } from "./repository";

type ProjectEnvelope<Data> = OperationEnvelope<
  Data,
  ProjectAction,
  PolicyDenialCode
>;

export interface CreateProjectOperationsOptions {
  readonly grantedPermissions: readonly ProjectPermission[];
  readonly ports: ProtectedOperationPorts;
  readonly repository: ProjectRepository;
  readonly resourceScope: ResourceScopePort;
}

export function createProjectOperations(
  options: CreateProjectOperationsOptions,
) {
  const envelope = <Data>(data: Data): ProjectEnvelope<Data> => ({
    data,
    uiMeta: buildProjectUiMeta(options.grantedPermissions),
  });

  return Object.freeze({
    archive: createProtectedOperation({
      handler: async (input, { access }) =>
        envelope(await options.repository.archive(input, access)),
      kind: "mutation",
      name: "project.archive",
      permission: "project:archive",
      ports: options.ports,
      resourceScope: options.resourceScope,
      schema: ArchiveProjectInputSchema,
    }),
    create: createProtectedOperation({
      handler: async (input, { access }) =>
        envelope(await options.repository.create(input, access)),
      kind: "mutation",
      name: "project.create",
      permission: "project:create",
      ports: options.ports,
      schema: CreateProjectInputSchema,
    }),
    get: createProtectedOperation({
      handler: async (input, { access }) =>
        envelope(await requireProject(options.repository, input.id, access)),
      kind: "query",
      name: "project.get",
      permission: "project:read",
      ports: options.ports,
      resourceScope: options.resourceScope,
      schema: GetProjectInputSchema,
    }),
    rename: createProtectedOperation({
      handler: async (input, { access }) =>
        envelope(await options.repository.rename(input, access)),
      kind: "mutation",
      name: "project.rename",
      permission: "project:rename",
      ports: options.ports,
      resourceScope: options.resourceScope,
      schema: RenameProjectInputSchema,
    }),
  });
}

async function requireProject(
  repository: ProjectRepository,
  id: string,
  access: Parameters<ProjectRepository["get"]>[1],
): Promise<Project> {
  const project = await repository.get(id, access);
  if (!project) {
    throw new CoreError("FORBIDDEN");
  }
  return project;
}

export type { ProjectEnvelope, ProjectMutationResult };
