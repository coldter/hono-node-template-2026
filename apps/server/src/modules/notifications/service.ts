import { notificationDeliveryService } from "./delivery-service";
import { notificationPreferencesService } from "./preferences-service";
import { notificationPushTokenService } from "./push-token-service";
import { notificationQueryService } from "./query-service";

export const notificationService = {
  ...notificationQueryService,
  ...notificationDeliveryService,
  ...notificationPushTokenService,
  ...notificationPreferencesService,
};
