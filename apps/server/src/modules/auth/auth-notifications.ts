import { NOTIFICATION_TYPES } from "@/modules/notifications/constants";
import { notificationService } from "@/modules/notifications/service";

/**
 * Notify a user when a sign-in is detected from a new device.
 */
export async function notifyLoginNewDevice(params: {
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
  platform: string;
}): Promise<void> {
  const deviceDesc =
    params.platform === "mobile" ? "a mobile device" : "a web browser";

  await notificationService.send({
    body: `A new sign-in was detected from ${deviceDesc}.`,
    props: {
      ipAddress: params.ipAddress,
      platform: params.platform,
      userAgent: params.userAgent,
    },
    subject: "New device sign-in",
    type: NOTIFICATION_TYPES.SECURITY_LOGIN_NEW_DEVICE,
    userId: params.userId,
  });
}
