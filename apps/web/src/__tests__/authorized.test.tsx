import { describe, expect, it } from "vitest";
import { createTestQueryClient, render, screen } from "@/__tests__/test-utils";
import { Authorized } from "@/components/authorized";
import { capabilitiesQueryOptions } from "@/hooks/use-authorization";

describe("Authorized", () => {
  it("renders children only when the capability is granted", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(capabilitiesQueryOptions.queryKey, {
      "user:create": true,
      "user:delete": false,
    });

    render(
      <>
        <Authorized capability="user:create">
          <div>Allowed content</div>
        </Authorized>
        <Authorized capability="user:delete" fallback={<div>Denied</div>}>
          <div>Should not render</div>
        </Authorized>
      </>,
      { queryClient }
    );

    expect(screen.getByText("Allowed content")).toBeInTheDocument();
    expect(screen.getByText("Denied")).toBeInTheDocument();
    expect(screen.queryByText("Should not render")).not.toBeInTheDocument();
  });
});
