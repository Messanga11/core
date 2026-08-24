import { z } from "zod";

const Id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9:_-]+$/);

export const ProjectSchema = z
  .object({
    id: Id,
    name: z.string().trim().min(1).max(120),
    status: z.enum(["active", "archived"]),
    tenantId: Id,
    version: z.number().int().positive(),
  })
  .strict();

export type Project = Readonly<z.infer<typeof ProjectSchema>>;

export const CreateProjectInputSchema = z
  .object({
    id: Id,
    idempotencyKey: Id,
    name: z.string().trim().min(1).max(120),
  })
  .strict();

export const GetProjectInputSchema = z.object({ id: Id }).strict();

export const RenameProjectInputSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    id: Id,
    idempotencyKey: Id,
    name: z.string().trim().min(1).max(120),
  })
  .strict();

export const ArchiveProjectInputSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    id: Id,
    idempotencyKey: Id,
  })
  .strict();

export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;
export type RenameProjectInput = z.infer<typeof RenameProjectInputSchema>;
export type ArchiveProjectInput = z.infer<typeof ArchiveProjectInputSchema>;

export type ProjectMutationResult =
  | Readonly<{ project: Project; status: "updated" }>
  | Readonly<{ current: Project; status: "conflict" }>;
