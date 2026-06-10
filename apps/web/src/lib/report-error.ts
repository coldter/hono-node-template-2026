type ErrorContext = Record<string, unknown>;

export function reportError(error: unknown, context?: ErrorContext): void {
  // Extension point: the template ships vendor-neutral, so this is a structured
  // console sink by default. Wire Sentry, an OTLP exporter, or any other
  // error-reporting vendor here to capture errors in production.
  console.error("[report-error]", error, context ?? {});
}

let initialized = false;

export function initErrorReporting(): void {
  // Guard against duplicate listeners from HMR or repeated module evaluation.
  if (initialized) {
    return;
  }
  initialized = true;

  window.addEventListener("error", (event) => {
    reportError(event.error ?? event.message, { source: "window.error" });
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportError(event.reason, { source: "unhandledrejection" });
  });
}
