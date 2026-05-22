import { z } from "zod";
import { env } from "@/env";
import { logger } from "@/lib/logger";

const firebaseServiceAccountSchema = z
  .object({
    project_id: z.string(),
    client_email: z.string().email(),
    private_key: z.string(),
  })
  .passthrough();

interface PushMessage {
  data: Record<string, string>;
  token: string;
}

interface PushSendResult {
  error?: string;
  /** True if the token is invalid and should be removed */
  invalidToken?: boolean;
  messageId?: string;
  success: boolean;
}

interface PushProvider {
  send(message: PushMessage): Promise<PushSendResult>;
}

class ConsolePushProvider implements PushProvider {
  async send(message: PushMessage): Promise<PushSendResult> {
    logger.info("Console push provider: would send push notification", {
      token: `${message.token.slice(0, 12)}...`,
      type: message.data.type,
      title: message.data.title,
      body: message.data.body,
    });
    return { success: true, messageId: `console_${Date.now()}` };
  }
}

class FirebasePushProvider implements PushProvider {
  private messagingInstance:
    | import("firebase-admin/messaging").Messaging
    | null = null;

  private async getMessaging(): Promise<
    import("firebase-admin/messaging").Messaging
  > {
    if (this.messagingInstance) {
      return this.messagingInstance;
    }

    const { initializeApp, cert, getApps } = await import("firebase-admin/app");
    const { getMessaging } = await import("firebase-admin/messaging");

    if (getApps().length === 0) {
      const serviceAccountKeyBase64 = env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64;
      if (!serviceAccountKeyBase64) {
        throw new Error(
          "FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 is required for firebase FCM provider"
        );
      }

      let serviceAccount: z.infer<typeof firebaseServiceAccountSchema>;
      try {
        const serviceAccountKey = Buffer.from(
          serviceAccountKeyBase64,
          "base64"
        ).toString("utf8");
        serviceAccount = firebaseServiceAccountSchema.parse(
          JSON.parse(serviceAccountKey)
        );
      } catch {
        throw new Error(
          "FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 must be a valid base64-encoded Firebase service account JSON with project_id, client_email, and private_key"
        );
      }

      initializeApp({
        credential: cert({
          projectId: serviceAccount.project_id,
          clientEmail: serviceAccount.client_email,
          privateKey: serviceAccount.private_key,
        }),
      });
    }

    this.messagingInstance = getMessaging();
    return this.messagingInstance;
  }

  async send(message: PushMessage): Promise<PushSendResult> {
    const messaging = await this.getMessaging();

    try {
      const fcmMessage: import("firebase-admin/messaging").Message = {
        token: message.token,
        data: message.data,
      };

      const messageId = await messaging.send(fcmMessage);
      return { success: true, messageId };
    } catch (error) {
      const errorCode =
        error instanceof Error && "code" in error
          ? (error as { code: string }).code
          : undefined;

      const isInvalidToken =
        errorCode === "messaging/registration-token-not-registered" ||
        errorCode === "messaging/invalid-registration-token" ||
        errorCode === "messaging/invalid-argument";

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        invalidToken: isInvalidToken,
      };
    }
  }
}

let pushProvider: PushProvider | null = null;

export function getPushProvider(): PushProvider {
  if (pushProvider) {
    return pushProvider;
  }

  if (env.FCM_PROVIDER === "firebase") {
    pushProvider = new FirebasePushProvider();
    logger.info("Firebase push provider initialized");
  } else {
    pushProvider = new ConsolePushProvider();
    logger.info("Console push provider initialized (FCM_PROVIDER=console)");
  }

  return pushProvider;
}

export type { PushMessage, PushProvider, PushSendResult };
