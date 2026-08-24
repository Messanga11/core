import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { NextRequest } from "next/server";
import { appRouter } from "../../../../server/runtime";

function handler(request: NextRequest) {
  return fetchRequestHandler({
    createContext: () => ({
      requestContext:
        request.cookies.has("messanga_session") ||
        request.headers.get("authorization") === "Bearer fixture-session"
          ? {
              actor: { id: "actor:fixture", type: "human" },
              requestId:
                request.headers.get("x-request-id") ?? crypto.randomUUID(),
              ...(request.headers.get("x-project-id")
                ? {
                    resource: {
                      id: request.headers.get("x-project-id"),
                      type: "project",
                    },
                  }
                : {}),
              tenantId: "tenant:fixture",
            }
          : {},
    }),
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
  });
}

export { handler as GET, handler as POST };
