type ErrorContext = Record<string, unknown>;

export function reportError(error: unknown, context?: ErrorContext): void {
  console.error("[report-error]", error, context ?? {});
}

let initialized = false;

export function initErrorReporting(): void {
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
