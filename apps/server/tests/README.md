# Server Tests

Integration tests for the Hono API server. Don't run the test unless you have a test database set up or you have explicitly permission to run them.

## Setup

1. Create a test database and set `DATABASE_TEST_URL` in your `.env.test` or environment
2. Run migrations: `DATABASE_URL=$DATABASE_TEST_URL bun db:push`
3. Run tests: `bun run test`

## Structure

```
tests/
├── setup.ts      # Global lifecycle hooks and mocks
├── fixtures.ts   # Static test data (headers, users)
├── helpers.ts    # Domain helpers (create user, parse response)
└── **/*.test.ts  # Test files organized by feature
```

## Writing Tests

```typescript
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { defaultHeaders, testUser } from "./fixtures";
import { parseResponse } from "./helpers";
import { clearDatabase, mockRateLimiter } from "./setup";

mockRateLimiter();

describe("Feature Name", async () => {
  const { default: app } = await import("@/server");
  const client = testClient(app);

  beforeAll(async () => {
    // Setup test-specific state
  });

  afterEach(async () => {
    await clearDatabase();
  });

  it("should do something", async () => {
    const res = await client.api.endpoint.$get({}, { headers: defaultHeaders });
    expect(res.status).toBe(200);
  });
});
```

## Running Tests

```bash
bun test              # Run all tests
bun test:watch        # Watch mode for development
bun test:coverage     # Generate coverage report
bun test -- --grep "pattern"  # Run specific tests
```
