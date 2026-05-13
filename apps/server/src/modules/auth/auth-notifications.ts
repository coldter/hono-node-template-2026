import { NOTIFICATION_TYPES } from "@/modules/notifications/constants";
import { notificationService } from "@/modules/notifications/service";

export async function notifyLoginNewDevice(params: {
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
  platform: string;
}): Promise<void> {
  const deviceDesc =
    params.platform === "mobile" ? "a mobile device" : "a web browser";

  await notificationService.send({
    userId: params.userId,
    type: NOTIFICATION_TYPES.SECURITY_LOGIN_NEW_DEVICE,
    subject: "New device sign-in",
    body: `A new sign-in was detected from ${deviceDesc}.`,
    props: {
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      platform: params.platform,
    },
  });
}
