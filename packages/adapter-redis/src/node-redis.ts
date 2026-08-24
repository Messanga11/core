import { createClient } from "redis";
import { z } from "zod";

import { parseConfiguration } from "./config";
import { RedisAdapterError } from "./errors";
import type { AtomicFunctionTransport } from "./transport";

const OptionsSchema = z
  .object({
    url: z.url().refine((value) => new URL(value).protocol === "rediss:"),
  })
  .strict();

export interface NodeRedisTransportOptions {
  readonly url: string;
}

export interface ManagedAtomicFunctionTransport
  extends AtomicFunctionTransport {
  close(): Promise<void>;
}

export function createNodeRedisFunctionTransport(
  untrustedOptions: NodeRedisTransportOptions,
): ManagedAtomicFunctionTransport {
  const options = parseConfiguration(OptionsSchema, untrustedOptions);
  const client = createClient({ url: options.url });
  let connecting: Promise<unknown> | undefined;

  async function ensureConnected(): Promise<void> {
    if (client.isReady) {
      return;
    }
    connecting ??= client.connect().catch((error) => {
      connecting = undefined;
      throw error;
    });
    await connecting;
  }

  return Object.freeze({
    async call(
      functionName: string,
      keys: readonly string[],
      arguments_: readonly string[],
    ) {
      try {
        await ensureConnected();
        return await client.fCall(functionName, {
          arguments: [...arguments_],
          keys: [...keys],
        });
      } catch (error) {
        throw new RedisAdapterError("SERVICE_UNAVAILABLE", error);
      }
    },
    async close() {
      try {
        if (client.isOpen) {
          await client.close();
        }
      } catch (error) {
        throw new RedisAdapterError("SERVICE_UNAVAILABLE", error);
      }
    },
    async load(source: string) {
      try {
        await ensureConnected();
        await client.functionLoad(source, { REPLACE: true });
      } catch (error) {
        throw new RedisAdapterError("SERVICE_UNAVAILABLE", error);
      }
    },
  });
}
