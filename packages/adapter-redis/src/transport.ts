import { REDIS_FUNCTION_LIBRARY } from "./functions";

export interface AtomicFunctionTransport {
  load(source: string): Promise<void>;
  call(
    functionName: string,
    keys: readonly string[],
    arguments_: readonly string[],
  ): Promise<unknown>;
}

export interface AtomicFunctionInvoker {
  call(
    functionName: string,
    keys: readonly string[],
    arguments_: readonly string[],
  ): Promise<unknown>;
}

export function createAtomicFunctionInvoker(
  transport: AtomicFunctionTransport,
): AtomicFunctionInvoker {
  let loading: Promise<void> | undefined;

  return Object.freeze({
    async call(
      functionName: string,
      keys: readonly string[],
      arguments_: readonly string[],
    ) {
      loading ??= transport.load(REDIS_FUNCTION_LIBRARY).catch((error) => {
        loading = undefined;
        throw error;
      });
      await loading;
      return transport.call(functionName, keys, arguments_);
    },
  });
}
