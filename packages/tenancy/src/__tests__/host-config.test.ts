import { describe, expect, it } from "vitest";
import { loadHostConfig } from "../host-config";

const COLLIDES_RE = /collides/i;

describe("loadHostConfig", () => {
  it("rejects wildcard/admin host collision", () => {
    expect(() =>
      loadHostConfig({
        APP_WILDCARD_HOST: "admin.example.com",
        ADMIN_HOST: "admin.example.com",
        FALLBACK_HOST: "x",
        NODE_ENV: "development",
      })
    ).toThrow(COLLIDES_RE);
  });

  it("normalizes inputs to lowercase", () => {
    const cfg = loadHostConfig({
      APP_WILDCARD_HOST: "App.Example.COM",
      ADMIN_HOST: "ADMIN.example.com",
      FALLBACK_HOST: "App.example.com",
      NODE_ENV: "test",
    });
    expect(cfg.wildcardSuffix).toBe(".app.example.com");
    expect(cfg.adminHost).toBe("admin.example.com");
    expect(cfg.fallbackHost).toBe("app.example.com");
    expect(cfg.nodeEnv).toBe("test");
  });

  it("maps unknown NODE_ENV values to development", () => {
    const cfg = loadHostConfig({
      APP_WILDCARD_HOST: "app.example.com",
      ADMIN_HOST: "admin.example.com",
      FALLBACK_HOST: "app.example.com",
      NODE_ENV: "staging",
    });
    expect(cfg.nodeEnv).toBe("development");
  });

  it("preserves production nodeEnv", () => {
    const cfg = loadHostConfig({
      APP_WILDCARD_HOST: "app.example.com",
      ADMIN_HOST: "admin.example.com",
      FALLBACK_HOST: "app.example.com",
      NODE_ENV: "production",
    });
    expect(cfg.nodeEnv).toBe("production");
  });

  it("strips a leading dot from APP_WILDCARD_HOST before prepending one", () => {
    const cfg = loadHostConfig({
      APP_WILDCARD_HOST: ".app.example.com",
      ADMIN_HOST: "admin.example.com",
      FALLBACK_HOST: "app.example.com",
      NODE_ENV: "development",
    });
    expect(cfg.wildcardSuffix).toBe(".app.example.com");
  });
});
