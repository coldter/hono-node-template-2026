import { type Meter, metrics, ValueType } from "@opentelemetry/api";
import { SERVICE_NAME } from "./otel-config";

type Instruments = {
  httpRequestDuration: ReturnType<Meter["createHistogram"]>;
  rateLimitRejections: ReturnType<Meter["createCounter"]>;
  hatchetEventPushes: ReturnType<Meter["createCounter"]>;
};

let instruments: Instruments | null = null;
let pendingPoolStats: PoolStats | null = null;

const HTTP_DURATION_BUCKETS_SECONDS = [
  0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10,
];

const KNOWN_HTTP_METHODS = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "DELETE",
  "CONNECT",
  "OPTIONS",
  "TRACE",
  "PATCH",
]);

export function initializeMetrics(): void {
  if (instruments) {
    return;
  }

  const meter = metrics.getMeter(SERVICE_NAME);
  instruments = {
    hatchetEventPushes: meter.createCounter("hatchet.events.pushed", {
      description: "Hatchet event push attempts",
    }),
    httpRequestDuration: meter.createHistogram("http.server.request.duration", {
      advice: { explicitBucketBoundaries: HTTP_DURATION_BUCKETS_SECONDS },
      description: "Duration of HTTP server requests",
      unit: "s",
      valueType: ValueType.DOUBLE,
    }),
    rateLimitRejections: meter.createCounter("rate_limit.rejections", {
      description: "Requests rejected by the global rate limiter",
    }),
  };

  if (pendingPoolStats) {
    createPoolGauges(meter, pendingPoolStats);
    pendingPoolStats = null;
  }
}

export function recordHttpRequestDuration(input: {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}): void {
  if (!instruments) {
    return;
  }
  instruments.httpRequestDuration.record(input.durationMs / 1000, {
    "http.request.method": KNOWN_HTTP_METHODS.has(input.method)
      ? input.method
      : "_OTHER",
    "http.response.status_code": input.statusCode,
    "http.route": input.route,
  });
}

export function recordRateLimitRejection(
  reason: "fail_closed" | "limit_exceeded"
): void {
  if (!instruments) {
    return;
  }
  instruments.rateLimitRejections.add(1, { reason });
}

export function recordHatchetEventPush(
  eventName: string,
  outcome: "success" | "failure"
): void {
  if (!instruments) {
    return;
  }
  instruments.hatchetEventPushes.add(1, { "event.name": eventName, outcome });
}

type PoolStats = {
  readonly totalCount: number;
  readonly idleCount: number;
  readonly waitingCount: number;
};

export function registerDbPoolGauges(pool: PoolStats): void {
  if (instruments) {
    createPoolGauges(metrics.getMeter(SERVICE_NAME), pool);
    return;
  }
  pendingPoolStats = pool;
}

function createPoolGauges(meter: Meter, pool: PoolStats): void {
  meter
    .createObservableGauge("db.client.connection.count", {
      description: "Open connections in the pg pool, by state",
    })
    .addCallback((result) => {
      result.observe(pool.idleCount, { "db.client.connection.state": "idle" });
      result.observe(pool.totalCount - pool.idleCount, {
        "db.client.connection.state": "used",
      });
    });
  meter
    .createObservableGauge("db.client.connection.pending_requests", {
      description: "Requests waiting for a pg pool connection",
    })
    .addCallback((result) => {
      result.observe(pool.waitingCount);
    });
}
