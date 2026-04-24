/** biome-ignore-all lint/suspicious/noConsole: script file */
import { readFileSync } from "node:fs";
import { confirm, input, select } from "@inquirer/prompts";
import {
  notificationPreferences,
  notifications,
  pushTokens,
  users,
} from "@repo/db/schema";
import chalk from "chalk";
import { highlight } from "cli-highlight";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { env } from "@/env";
import { getPushProvider } from "@/lib/firebase";
import {
  NOTIFICATION_TYPE_CONFIG,
  NOTIFICATION_TYPES,
  type NotificationType,
} from "@/modules/notifications/constants";
import { notificationService } from "@/modules/notifications/service";

// -- Safety guard --

if (env.NODE_ENV === "production") {
  console.error(chalk.red("push-debug cannot run in production."));
  process.exit(1);
}

// -- Helpers --

function prettyJson(data: unknown): string {
  const json = JSON.stringify(data, null, 2);
  return highlight(json, { language: "json", ignoreIllegals: true });
}

function printHeader(): void {
  const provider = env.FCM_PROVIDER === "firebase" ? "firebase" : "console";
  console.log(
    chalk.bold("\nPush Debug Tool") + chalk.dim(" (development only)")
  );
  console.log(chalk.dim(`Provider: ${provider}\n`));
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function resolveUser(
  identifier: string
): Promise<{ id: string; email: string; name: string }> {
  const isUserId = identifier.startsWith("usr_");

  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(isUserId ? eq(users.id, identifier) : eq(users.email, identifier))
    .limit(1);

  if (!user) {
    console.error(
      chalk.red(
        `User not found: ${identifier} (looked up by ${isUserId ? "ID" : "email"})`
      )
    );
    process.exit(1);
  }

  return user;
}

// -- Commands --

async function inspectCommand(identifier: string): Promise<void> {
  const user = await resolveUser(identifier);

  // User info
  console.log(chalk.bold.cyan("\n--- User ---"));
  console.log(chalk.dim(`ID:     ${user.id}`));
  console.log(chalk.dim(`Email:  ${user.email}`));
  console.log(chalk.dim(`Name:   ${user.name}`));

  // Push tokens
  const tokens = await db
    .select()
    .from(pushTokens)
    .where(eq(pushTokens.userId, user.id));

  const activeTokens = tokens.filter((t) => t.isActive);
  const inactiveTokens = tokens.filter((t) => !t.isActive);

  console.log(
    chalk.bold.cyan(
      `\n--- Push Tokens (${activeTokens.length} active, ${inactiveTokens.length} inactive) ---`
    )
  );

  if (tokens.length === 0) {
    console.log(chalk.yellow("  No push tokens registered"));
  }

  for (const token of activeTokens) {
    const lastUsed = token.lastUsedAt ? timeAgo(token.lastUsedAt) : "never";
    const device = token.deviceName ?? "unknown device";
    console.log(
      chalk.dim(
        `  ${chalk.green("ACTIVE")}  ${token.id}  |  ${token.platform.padEnd(7)}  |  ${device.padEnd(16)}  |  Last used: ${lastUsed}`
      )
    );
  }

  for (const token of inactiveTokens) {
    const device = token.deviceName ?? "unknown device";
    console.log(
      chalk.dim(
        `  ${chalk.red("INACTIVE")}  ${token.id}  |  ${token.platform.padEnd(7)}  |  ${device}`
      )
    );
  }

  // Recent notifications
  const recentNotifications = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(10);

  console.log(chalk.bold.cyan("\n--- Recent Notifications (last 10) ---"));

  if (recentNotifications.length === 0) {
    console.log(chalk.yellow("  No notifications found"));
  }

  for (const n of recentNotifications) {
    const age = timeAgo(n.createdAt);
    let statusColor = chalk.yellow;
    if (n.status === "delivered") {
      statusColor = chalk.green;
    } else if (n.status === "failed") {
      statusColor = chalk.red;
    }
    const error = n.errorMessage ? chalk.red(` (${n.errorMessage})`) : "";
    console.log(
      chalk.dim(
        `  ${n.id}  ${n.type.padEnd(24)}  ${n.channel.padEnd(5)}  ${statusColor(n.status.padEnd(9))}  ${age}${error}`
      )
    );
  }

  // Preferences
  const preferences = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, user.id));

  console.log(chalk.bold.cyan("\n--- Preferences ---"));

  if (preferences.length === 0) {
    console.log(chalk.yellow("  No preferences set (defaults apply)"));
  }

  for (const pref of preferences) {
    const push = pref.pushEnabled ? chalk.green("ON") : chalk.red("OFF");
    const email = pref.emailEnabled ? chalk.green("ON") : chalk.red("OFF");
    const sms = pref.smsEnabled ? chalk.green("ON") : chalk.red("OFF");
    const pattern = pref.typePattern === "*" ? "Global" : pref.typePattern;
    console.log(
      chalk.dim(
        `  ${pattern.padEnd(20)}  push=${push}  email=${email}  sms=${sms}`
      )
    );
  }
}

async function sendCommand(
  identifier: string,
  notificationType?: string
): Promise<void> {
  const user = await resolveUser(identifier);

  let type: NotificationType;

  if (notificationType) {
    const allTypes: string[] = Object.values(NOTIFICATION_TYPES);
    if (!allTypes.includes(notificationType)) {
      console.error(
        chalk.red(`Unknown notification type: ${notificationType}`)
      );
      console.log(chalk.dim(`Available types:\n  ${allTypes.join("\n  ")}`));
      return;
    }
    type = notificationType as NotificationType;
  } else {
    const allTypes = Object.values(NOTIFICATION_TYPES);
    type = await select({
      message: "Select notification type:",
      choices: allTypes.map((t) => ({
        name: t,
        value: t,
        description: `channels: ${NOTIFICATION_TYPE_CONFIG[t].channels.join(", ")} | priority: ${NOTIFICATION_TYPE_CONFIG[t].priority}`,
      })),
    });
  }

  const config = NOTIFICATION_TYPE_CONFIG[type];
  const typeName = type.replace(/[._]/g, " ");

  console.log(
    chalk.dim(`\nSending ${chalk.bold(type)} to ${user.email} (${user.id})...`)
  );
  console.log(
    chalk.dim(
      `  Channels: ${config.channels.join(", ")}  |  Priority: ${config.priority}`
    )
  );

  const result = await notificationService.send({
    userId: user.id,
    type,
    subject: `Test: ${typeName}`,
    body: `Test notification for ${type} triggered via push-debug CLI.`,
    props: { debugTool: true },
  });

  console.log(chalk.bold("\nResult:"));
  console.log(
    chalk.dim(
      `  Notification IDs: ${result.notificationIds.join(", ") || "none"}`
    )
  );
  console.log(chalk.dim(`  Requested channels: ${result.channels.join(", ")}`));
  console.log(
    chalk.dim(
      `  Sent: ${result.sentChannels.length > 0 ? chalk.green(result.sentChannels.join(", ")) : chalk.yellow("none")}`
    )
  );

  if (result.failedChannels.length > 0) {
    for (const f of result.failedChannels) {
      console.log(chalk.red(`  Failed: ${f.channel} - ${f.error}`));
    }
  }

  if (result.sentChannels.length === 0 && result.failedChannels.length === 0) {
    console.log(
      chalk.yellow(
        "\n  All channels filtered out by user preferences. Use 'inspect' to check."
      )
    );
  }
}

async function sendDirectCommand(identifier: string): Promise<void> {
  const user = await resolveUser(identifier);

  const tokens = await db
    .select()
    .from(pushTokens)
    .where(and(eq(pushTokens.userId, user.id), eq(pushTokens.isActive, true)));

  if (tokens.length === 0) {
    console.error(chalk.red(`No active push tokens for ${user.email}`));
    return;
  }

  console.log(
    chalk.dim(
      `\nSending test push directly to ${tokens.length} token(s) for ${user.email}...`
    )
  );

  const provider = getPushProvider();
  let deliveredCount = 0;
  let failedCount = 0;

  for (const token of tokens) {
    const device = token.deviceName ?? "unknown device";
    const testId = `debug_${Date.now()}`;

    const result = await provider.send({
      token: token.token,
      data: {
        notificationId: testId,
        type: "debug.test",
        title: "Push Debug Test",
        body: `Direct test push sent at ${new Date().toLocaleTimeString()}`,
        priority: "high",
        deepLink: `notification/${testId}`,
      },
    });

    if (result.success) {
      deliveredCount++;
      console.log(
        chalk.dim(
          `  Token ${token.id} (${token.platform}, ${device}):  ${chalk.green("SUCCESS")}  msgId=${result.messageId}`
        )
      );
    } else {
      failedCount++;
      const invalidNote = result.invalidToken
        ? chalk.red(" (token removed)")
        : "";
      console.log(
        chalk.dim(
          `  Token ${token.id} (${token.platform}, ${device}):  ${chalk.red("FAILED")}  ${result.error}${invalidNote}`
        )
      );

      if (result.invalidToken) {
        await notificationService.deletePushTokenByToken(token.token);
      }
    }
  }

  console.log(
    chalk.bold(
      `\nResult: ${deliveredCount}/${tokens.length} delivered, ${failedCount} failed`
    )
  );
}

async function sendRawCommand(
  identifier: string,
  jsonInput?: string
): Promise<void> {
  const user = await resolveUser(identifier);

  let data: Record<string, string>;

  if (jsonInput) {
    try {
      data = JSON.parse(jsonInput);
    } catch (e) {
      console.error(
        chalk.red(
          `Invalid JSON: ${e instanceof Error ? e.message : "parse error"}`
        )
      );
      return;
    }
  } else {
    const raw = await input({
      message: "Enter JSON payload (data field for FCM):",
      validate: (val) => {
        try {
          JSON.parse(val);
          return true;
        } catch {
          return "Must be valid JSON";
        }
      },
    });
    data = JSON.parse(raw);
  }

  const stringData: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    stringData[key] = String(value);
  }

  console.log(chalk.bold.yellow("\nPayload:"));
  console.log(prettyJson(stringData));

  const tokens = await db
    .select()
    .from(pushTokens)
    .where(and(eq(pushTokens.userId, user.id), eq(pushTokens.isActive, true)));

  if (tokens.length === 0) {
    console.error(chalk.red(`No active push tokens for ${user.email}`));
    return;
  }

  const proceed = await confirm({
    message: `Send this payload to ${tokens.length} token(s)?`,
    default: true,
  });

  if (!proceed) {
    console.log(chalk.yellow("Aborted."));
    return;
  }

  const provider = getPushProvider();
  let deliveredCount = 0;
  let failedCount = 0;

  for (const token of tokens) {
    const device = token.deviceName ?? "unknown device";

    const result = await provider.send({
      token: token.token,
      data: stringData,
    });

    if (result.success) {
      deliveredCount++;
      console.log(
        chalk.dim(
          `  Token ${token.id} (${token.platform}, ${device}):  ${chalk.green("SUCCESS")}  msgId=${result.messageId}`
        )
      );
    } else {
      failedCount++;
      const invalidNote = result.invalidToken
        ? chalk.red(" (token removed)")
        : "";
      console.log(
        chalk.dim(
          `  Token ${token.id} (${token.platform}, ${device}):  ${chalk.red("FAILED")}  ${result.error}${invalidNote}`
        )
      );

      if (result.invalidToken) {
        await notificationService.deletePushTokenByToken(token.token);
      }
    }
  }

  console.log(
    chalk.bold(
      `\nResult: ${deliveredCount}/${tokens.length} delivered, ${failedCount} failed`
    )
  );
}

async function sendAllTypesCommand(identifier: string): Promise<void> {
  const user = await resolveUser(identifier);

  const pushTypes = Object.entries(NOTIFICATION_TYPE_CONFIG)
    .filter(([, config]) => config.channels.includes("push"))
    .map(([type]) => type as NotificationType);

  console.log(
    chalk.dim(
      `\nSending ${pushTypes.length} push-enabled notification types to ${user.email}...`
    )
  );

  const proceed = await confirm({
    message: `Send ${pushTypes.length} notifications via full pipeline?`,
    default: false,
  });

  if (!proceed) {
    console.log(chalk.yellow("Aborted."));
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (const type of pushTypes) {
    const typeName = type.replace(/[._]/g, " ");
    try {
      const result = await notificationService.send({
        userId: user.id,
        type,
        subject: `Test: ${typeName}`,
        body: `Test notification for ${type} triggered via push-debug CLI.`,
        props: { debugTool: true },
      });

      const sent = result.sentChannels.length > 0;
      if (sent) {
        successCount++;
        console.log(chalk.dim(`  ${chalk.green("SENT")}     ${type}`));
      } else {
        failCount++;
        console.log(
          chalk.dim(
            `  ${chalk.yellow("FILTERED")}  ${type}  (no channels enabled)`
          )
        );
      }
    } catch (error) {
      failCount++;
      const msg = error instanceof Error ? error.message : "unknown error";
      console.log(chalk.dim(`  ${chalk.red("ERROR")}    ${type}  ${msg}`));
    }
  }

  console.log(
    chalk.bold(
      `\nResult: ${successCount} sent, ${failCount} filtered/failed out of ${pushTypes.length} types`
    )
  );
}

async function cleanupCommand(identifier: string): Promise<void> {
  const user = await resolveUser(identifier);

  const tokens = await db
    .select()
    .from(pushTokens)
    .where(eq(pushTokens.userId, user.id));

  const inactiveTokens = tokens.filter((t) => !t.isActive);

  if (inactiveTokens.length === 0) {
    console.log(
      chalk.green(
        `\nNo inactive tokens for ${user.email}. Nothing to clean up.`
      )
    );
    return;
  }

  console.log(
    chalk.bold(
      `\n${inactiveTokens.length} inactive token(s) for ${user.email}:`
    )
  );

  for (const token of inactiveTokens) {
    const device = token.deviceName ?? "unknown device";
    const created = timeAgo(token.createdAt);
    console.log(
      chalk.dim(
        `  ${token.id}  |  ${token.platform.padEnd(7)}  |  ${device}  |  Created: ${created}`
      )
    );
  }

  const proceed = await confirm({
    message: `Delete ${inactiveTokens.length} inactive token(s)?`,
    default: false,
  });

  if (!proceed) {
    console.log(chalk.yellow("Aborted."));
    return;
  }

  for (const token of inactiveTokens) {
    await notificationService.deletePushTokenByToken(token.token);
  }

  console.log(
    chalk.green(`\nDeleted ${inactiveTokens.length} inactive token(s).`)
  );
}

// -- Interactive menu --

async function interactiveMenu(): Promise<void> {
  printHeader();

  while (true) {
    const action = await select({
      message: "Choose an operation:",
      choices: [
        {
          name: "Inspect user",
          value: "inspect",
          description:
            "View push tokens, recent notifications, and preferences",
        },
        {
          name: "Send notification (full pipeline)",
          value: "send",
          description: "Send via notificationService -> Hatchet -> Firebase",
        },
        {
          name: "Send direct (bypass Hatchet)",
          value: "send-direct",
          description: "Send test push directly via Firebase provider",
        },
        {
          name: "Send raw payload",
          value: "send-raw",
          description: "Send custom JSON payload directly to Firebase",
        },
        {
          name: "Send all push types",
          value: "send-all-types",
          description:
            "Send every push-enabled notification type via full pipeline",
        },
        {
          name: "Cleanup inactive tokens",
          value: "cleanup",
          description: "List and delete inactive push tokens",
        },
        { name: "Exit", value: "exit" },
      ],
    });

    if (action === "exit") {
      break;
    }

    try {
      const identifier = await input({
        message: "User (ID or email):",
        validate: (val) => (val.length > 0 ? true : "Required"),
      });

      switch (action) {
        case "inspect":
          await inspectCommand(identifier);
          break;
        case "send": {
          await sendCommand(identifier);
          break;
        }
        case "send-direct":
          await sendDirectCommand(identifier);
          break;
        case "send-raw":
          await sendRawCommand(identifier);
          break;
        case "send-all-types":
          await sendAllTypesCommand(identifier);
          break;
        case "cleanup":
          await cleanupCommand(identifier);
          break;
        default:
          break;
      }
    } catch (error) {
      console.error(
        chalk.red(
          `\nError: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }

    console.log("");
  }
}

// -- CLI routing --

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    await interactiveMenu();
    return;
  }

  printHeader();

  switch (command) {
    case "inspect": {
      const identifier = args[1];
      if (!identifier) {
        console.error(chalk.red("Usage: push:debug inspect <userId|email>"));
        process.exit(1);
      }
      await inspectCommand(identifier);
      break;
    }
    case "send": {
      const identifier = args[1];
      if (!identifier) {
        console.error(
          chalk.red("Usage: push:debug send <userId|email> [type]")
        );
        process.exit(1);
      }
      await sendCommand(identifier, args[2]);
      break;
    }
    case "send-direct": {
      const identifier = args[1];
      if (!identifier) {
        console.error(
          chalk.red("Usage: push:debug send-direct <userId|email>")
        );
        process.exit(1);
      }
      await sendDirectCommand(identifier);
      break;
    }
    case "send-raw": {
      const identifier = args[1];
      if (!identifier) {
        console.error(
          chalk.red(
            "Usage: push:debug send-raw <userId|email> [--json '<json>' | --file <path>]"
          )
        );
        process.exit(1);
      }
      let jsonInput: string | undefined;
      const jsonFlag = args.indexOf("--json");
      const fileFlag = args.indexOf("--file");
      const jsonValue = jsonFlag === -1 ? undefined : args[jsonFlag + 1];
      const fileValue = fileFlag === -1 ? undefined : args[fileFlag + 1];
      if (jsonValue) {
        jsonInput = jsonValue;
      } else if (fileValue) {
        jsonInput = readFileSync(fileValue, "utf8");
      }
      await sendRawCommand(identifier, jsonInput);
      break;
    }
    case "send-all-types": {
      const identifier = args[1];
      if (!identifier) {
        console.error(
          chalk.red("Usage: push:debug send-all-types <userId|email>")
        );
        process.exit(1);
      }
      await sendAllTypesCommand(identifier);
      break;
    }
    case "cleanup": {
      const identifier = args[1];
      if (!identifier) {
        console.error(chalk.red("Usage: push:debug cleanup <userId|email>"));
        process.exit(1);
      }
      await cleanupCommand(identifier);
      break;
    }
    case "help":
    case "--help": {
      console.log("Usage: push:debug [command] [args]");
      console.log("\nCommands:");
      console.log(
        "  inspect <userId|email>                          View push tokens, notifications, preferences"
      );
      console.log(
        "  send <userId|email> [type]                      Send notification via full pipeline"
      );
      console.log(
        "  send-direct <userId|email>                      Send direct push bypassing Hatchet"
      );
      console.log(
        "  send-raw <userId|email> [--json|--file]         Send custom payload to Firebase"
      );
      console.log(
        "  send-all-types <userId|email>                   Send all push-enabled types"
      );
      console.log(
        "  cleanup <userId|email>                          Delete inactive push tokens"
      );
      break;
    }
    default:
      console.error(chalk.red(`Unknown command: ${command}`));
      console.log(
        "Available commands: inspect, send, send-direct, send-raw, send-all-types, cleanup"
      );
      process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error(
      chalk.red(
        `Fatal: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    );
    process.exit(1);
  })
  .finally(() => process.exit(0));
