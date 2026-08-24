"use client";

import { canPerform, type UiMeta } from "@messanga11/core";
import type { PolicyDenialCode } from "@messanga11/core/policy";
import type { ProjectAction } from "@messanga11/project-fixture";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { useRef, useState } from "react";
import type { AppRouter } from "../server/runtime";

const PROJECT_ID = "project:fixture";

export function ProjectDemo() {
  const [name, setName] = useState("Architecture Core");
  const [confirmedName, setConfirmedName] = useState("Architecture Core");
  const [version, setVersion] = useState(1);
  const [status, setStatus] = useState("Prêt");
  const [projectStatus, setProjectStatus] = useState<"active" | "archived">(
    "active",
  );
  const [submitting, setSubmitting] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [uiMeta, setUiMeta] =
    useState<UiMeta<ProjectAction, PolicyDenialCode>>();
  const [client] = useState(createClient);
  const archiveButton = useRef<HTMLButtonElement>(null);
  const archiveAllowed = uiMeta ? canPerform(uiMeta, "archive") : false;

  async function ensureProject() {
    await fetch("/api/session", { method: "POST" });
    const response = await client.project.create.mutate({
      id: PROJECT_ID,
      idempotencyKey: "create:fixture",
      name: confirmedName,
    });
    setUiMeta(response.uiMeta);
  }

  async function renameProject() {
    const previous = confirmedName;
    setSubmitting(true);
    setConfirmedName(name);
    setStatus("Enregistrement…");
    try {
      await ensureProject();
      const response = await client.project.rename.mutate({
        expectedVersion: version,
        id: PROJECT_ID,
        idempotencyKey: `rename:${version}:${name}`,
        name,
      });
      setUiMeta(response.uiMeta);
      if (response.data.status === "conflict") {
        setConfirmedName(response.data.current.name);
        setVersion(response.data.current.version);
        setStatus("Le projet a changé ailleurs. État serveur restauré.");
      } else {
        setVersion(response.data.project.version);
        setStatus("Nom enregistré.");
      }
    } catch {
      setConfirmedName(previous);
      setStatus("Échec réseau. Modification annulée.");
    } finally {
      setSubmitting(false);
    }
  }

  async function archiveProject() {
    setConfirmationOpen(false);
    setSubmitting(true);
    setStatus("Archivage…");
    try {
      const response = await client.project.archive.mutate({
        expectedVersion: version,
        id: PROJECT_ID,
        idempotencyKey: `archive:${version}`,
      });
      setUiMeta(response.uiMeta);
      if (response.data.status === "updated") {
        setProjectStatus("archived");
        setVersion(response.data.project.version);
        setStatus("Projet archivé.");
      } else {
        setVersion(response.data.current.version);
        setStatus("Conflit détecté. État serveur restauré.");
      }
    } catch {
      setStatus("Archivage impossible.");
    } finally {
      setSubmitting(false);
      queueMicrotask(() => archiveButton.current?.focus());
    }
  }

  function closeConfirmation() {
    setConfirmationOpen(false);
    queueMicrotask(() => archiveButton.current?.focus());
  }

  return (
    <section className="panel" aria-labelledby="project-heading">
      <div className="project">
        <div>
          <strong id="project-heading">{confirmedName}</strong>
          <div>
            <span>Révision {version}</span>
          </div>
        </div>
        <span>{projectStatus === "active" ? "Tenant isolé" : "Archivé"}</span>
      </div>
      <label className="field" htmlFor="project-name">
        Nouveau nom
        <input
          id="project-name"
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </label>
      <div className="actions">
        <button
          disabled={submitting || name.trim().length === 0}
          onClick={renameProject}
          type="button"
        >
          {submitting ? "Enregistrement…" : "Renommer"}
        </button>
        <button
          className="danger"
          disabled={
            submitting || !archiveAllowed || projectStatus === "archived"
          }
          onClick={() => setConfirmationOpen(true)}
          ref={archiveButton}
          type="button"
          title={
            archiveAllowed
              ? "Archiver le projet"
              : "Action indisponible avant synchronisation"
          }
        >
          Archiver
        </button>
      </div>
      {confirmationOpen ? (
        <section
          aria-labelledby="archive-title"
          aria-modal="true"
          className="confirmation"
          role="alertdialog"
        >
          <strong id="archive-title">Archiver ce projet ?</strong>
          <p>Le projet restera consultable mais ne pourra plus être modifié.</p>
          <div className="actions">
            <button className="danger" onClick={archiveProject} type="button">
              Confirmer
            </button>
            <button
              className="secondary"
              onClick={closeConfirmation}
              type="button"
            >
              Annuler
            </button>
          </div>
        </section>
      ) : null}
      <p aria-live="polite" className="status" data-live-region>
        {status}
      </p>
    </section>
  );
}

function createClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        headers: () => ({
          "x-project-id": PROJECT_ID,
          "x-request-id": crypto.randomUUID(),
        }),
        url: "/api/trpc",
      }),
    ],
  });
}
