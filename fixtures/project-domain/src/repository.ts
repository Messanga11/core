import {
  type AccessGrant,
  CoreError,
  isAccessGrant,
} from "@messanga11/core/server";
import type {
  ArchiveProjectInput,
  CreateProjectInput,
  Project,
  ProjectMutationResult,
  RenameProjectInput,
} from "./model";

export interface ProjectRepository {
  archive(
    input: ArchiveProjectInput,
    access: AccessGrant,
  ): Promise<ProjectMutationResult>;
  create(input: CreateProjectInput, access: AccessGrant): Promise<Project>;
  get(id: string, access: AccessGrant): Promise<Project | undefined>;
  rename(
    input: RenameProjectInput,
    access: AccessGrant,
  ): Promise<ProjectMutationResult>;
}

export function createInMemoryProjectRepository(): ProjectRepository {
  const projects = new Map<string, Project>();
  const replays = new Map<string, Project | ProjectMutationResult>();

  return {
    async archive(input, access) {
      requireProjectGrant(access, "project:archive", input.id);
      const replay = replays.get(input.idempotencyKey);
      if (isMutationResult(replay)) {
        return replay;
      }
      const current = projects.get(key(access.tenantId, input.id));
      const result = mutate(current, input.expectedVersion, (project) => ({
        ...project,
        status: "archived",
        version: project.version + 1,
      }));
      storeMutation(
        projects,
        replays,
        access.tenantId,
        input.id,
        input.idempotencyKey,
        result,
      );
      return result;
    },
    async create(input, access) {
      requireProjectGrant(access, "project:create");
      const replay = replays.get(input.idempotencyKey);
      if (isProject(replay)) {
        return replay;
      }
      const project = Object.freeze({
        id: input.id,
        name: input.name,
        status: "active" as const,
        tenantId: access.tenantId,
        version: 1,
      });
      projects.set(key(access.tenantId, input.id), project);
      replays.set(input.idempotencyKey, project);
      return project;
    },
    async get(id, access) {
      requireProjectGrant(access, "project:read", id);
      return projects.get(key(access.tenantId, id));
    },
    async rename(input, access) {
      requireProjectGrant(access, "project:rename", input.id);
      const replay = replays.get(input.idempotencyKey);
      if (isMutationResult(replay)) {
        return replay;
      }
      const current = projects.get(key(access.tenantId, input.id));
      const result = mutate(current, input.expectedVersion, (project) => ({
        ...project,
        name: input.name,
        version: project.version + 1,
      }));
      storeMutation(
        projects,
        replays,
        access.tenantId,
        input.id,
        input.idempotencyKey,
        result,
      );
      return result;
    },
  };
}

function requireProjectGrant(
  access: AccessGrant,
  permission: string,
  resourceId?: string,
): void {
  if (!isAccessGrant(access) || access.permission !== permission) {
    throw new CoreError("FORBIDDEN");
  }
  if (resourceId && access.resource?.id !== resourceId) {
    throw new CoreError("FORBIDDEN");
  }
}

function mutate(
  current: Project | undefined,
  expectedVersion: number,
  update: (project: Project) => Project,
): ProjectMutationResult {
  if (!current) {
    throw new CoreError("FORBIDDEN");
  }
  if (current.version !== expectedVersion) {
    return Object.freeze({ current, status: "conflict" });
  }
  return Object.freeze({
    project: Object.freeze(update(current)),
    status: "updated",
  });
}

function storeMutation(
  projects: Map<string, Project>,
  replays: Map<string, Project | ProjectMutationResult>,
  tenantId: string,
  projectId: string,
  idempotencyKey: string,
  result: ProjectMutationResult,
): void {
  if (result.status === "updated") {
    projects.set(key(tenantId, projectId), result.project);
  }
  replays.set(idempotencyKey, result);
}

function key(tenantId: string, projectId: string): string {
  return `${tenantId}:${projectId}`;
}

function isProject(value: unknown): value is Project {
  return typeof value === "object" && value !== null && "version" in value;
}

function isMutationResult(value: unknown): value is ProjectMutationResult {
  return typeof value === "object" && value !== null && "status" in value;
}
