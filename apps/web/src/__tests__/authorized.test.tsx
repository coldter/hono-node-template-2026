import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/__tests__/test-utils";
import { Authorized } from "@/components/authorized";

vi.mock("@/hooks/use-authorization", () => ({
  useAuthorization: () => ({
    capabilities: {
      "user:create": true,
      "user:delete": false,
    },
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

describe("Authorized", () => {
  it("renders children when capability is granted", () => {
    render(
      <Authorized capability="user:create">
        <div>Allowed content</div>
      </Authorized>
    );

    expect(screen.getByText("Allowed content")).toBeInTheDocument();
  });

  it("renders fallback when capability is missing", () => {
    render(
      <Authorized capability="user:delete" fallback={<div>Denied</div>}>
        <div>Should not render</div>
      </Authorized>
    );

    expect(screen.getByText("Denied")).toBeInTheDocument();
    expect(screen.queryByText("Should not render")).not.toBeInTheDocument();
  });
});
