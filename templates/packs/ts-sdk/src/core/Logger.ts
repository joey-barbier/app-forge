/**
 * Ops port — injected logger, silent by default (SDK_CONTRACT.md §5).
 *
 * Zero direct console calls anywhere in src/: the consumer owns the output and the switch.
 * NEVER log token values, Authorization headers, or token-presence booleans —
 * a production team once mapped its whole auth topology into every consumer's
 * devtools that way. Log method + path, nothing from headers.
 */

export interface SDKLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export const noopLogger: SDKLogger = {
  debug: () => {},
  error: () => {},
};

/** Gate `debug()` behind the consumer's `debug` flag; errors always pass through. */
export function gateDebug(logger: SDKLogger, debug: boolean): SDKLogger {
  if (debug) return logger;
  return {
    debug: () => {},
    error: (message, meta) => logger.error(message, meta),
  };
}
