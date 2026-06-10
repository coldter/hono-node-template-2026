import type { PushEventOptions } from "@hatchet-dev/typescript-sdk/clients/event/event-client";
import { env } from "@/env";
import { getHatchet } from "@/lib/hatchet";
import { logger } from "@/lib/logger";
import { recordHatchetEventPush } from "@/lib/metrics";
import { redactSensitiveFields } from "@/lib/otel-config";
import { addSpanEvent } from "@/lib/otel-utils";

export const EVENTS = {
  USER_CREATED: "user.created",
  USER_UPDATED: "user.updated",
  USER_DEACTIVATED: "user.deactivated",
  NOTIFICATION_EMAIL_SEND: "notification.email.send",
  NOTIFICATION_PUSH_SEND: "notification.push.send",
} as const;

export type EventPayloads = {
  [EVENTS.USER_CREATED]: {
    userId: string;
    email: string;
    name: string;
  };
  [EVENTS.USER_UPDATED]: {
    userId: string;
    changes: Record<string, unknown>;
  };
  [EVENTS.USER_DEACTIVATED]: {
    userId: string;
    deactivatedBy: string;
    reason: string | null;
  };
  [EVENTS.NOTIFICATION_EMAIL_SEND]: {
    notificationId: string;
  };
  [EVENTS.NOTIFICATION_PUSH_SEND]: {
    notificationId: string;
  };
};

export type PushEventResult = { success: boolean; error?: Error };

export async function pushEvent<K extends keyof EventPayloads>(
  eventName: K,
  payload: EventPayloads[K],
  options?: PushEventOptions
): Promise<PushEventResult> {
  const hatchet = getHatchet();

  if (!hatchet) {
    logger.debug(`Hatchet disabled, skipping event: ${eventName}`);
    return { success: true };
  }

  try {
    addSpanEvent("hatchet.event.push", { eventName });
    await hatchet.events.push(eventName, payload, options);
    recordHatchetEventPush(eventName, "success");
    logger.debug(`Event pushed: ${eventName}`, { payload });
    return { success: true };
  } catch (error) {
    recordHatchetEventPush(eventName, "failure");
    const err = error instanceof Error ? error : new Error(String(error));

    if (env.NODE_ENV === "development") {
      logger.error(`[HATCHET] Failed to push event: ${eventName}`, {
        error: err.message,
        stack: err.stack,
        payload: redactSensitiveFields(
          payload as unknown as Record<string, unknown>
        ),
      });
    } else {
      logger.error(`Failed to push event: ${eventName}`, {
        error: err.message,
      });
    }

    if (env.NODE_ENV === "test" && env.HATCHET_THROW_ON_ERROR) {
      throw err;
    }

    return { success: false, error: err };
  }
}

export async function pushEvents<K extends keyof EventPayloads>(
  eventName: K,
  payloads: EventPayloads[K][],
  options?: PushEventOptions
): Promise<PushEventResult> {
  const hatchet = getHatchet();

  if (!hatchet) {
    logger.debug(`Hatchet disabled, skipping bulk events: ${eventName}`);
    return { success: true };
  }

  try {
    addSpanEvent("hatchet.event.bulk_push", {
      eventName,
      count: payloads.length,
    });
    await hatchet.events.bulkPush(
      eventName,
      payloads.map((payload) => ({ payload })),
      options
    );
    logger.debug(`Bulk events pushed: ${eventName}`, {
      count: payloads.length,
    });
    return { success: true };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    if (env.NODE_ENV === "development") {
      logger.error(`[HATCHET] Failed to bulk push events: ${eventName}`, {
        error: err.message,
        stack: err.stack,
        payloads: payloads.map((payload) =>
          redactSensitiveFields(payload as unknown as Record<string, unknown>)
        ),
      });
    } else {
      logger.error(`Failed to bulk push events: ${eventName}`, {
        error: err.message,
      });
    }

    if (env.NODE_ENV === "test" && env.HATCHET_THROW_ON_ERROR) {
      throw err;
    }

    return { success: false, error: err };
  }
}
