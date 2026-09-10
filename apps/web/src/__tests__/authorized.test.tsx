import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { createTestQueryClient, render, screen } from "@/__tests__/test-utils";
import { Authorized } from "@/components/authorized";
import { capabilitiesQueryOptions } from "@/hooks/use-authorization";

function renderAuthorized(ui: ReactElement) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(capabilitiesQueryOptions.queryKey, {
    "user:create": true,
    "user:delete": false,
  });
  return render(ui, { queryClient });
}

describe("Authorized", () => {
  it("renders children when capability is granted", () => {
    renderAuthorized(
      <Authorized capability="user:create">
        <div>Allowed content</div>
      </Authorized>
    );

    expect(screen.getByText("Allowed content")).toBeInTheDocument();
  });

  it("renders fallback when capability is missing", () => {
    renderAuthorized(
      <Authorized capability="user:delete" fallback={<div>Denied</div>}>
        <div>Should not render</div>
      </Authorized>
    );

    expect(screen.getByText("Denied")).toBeInTheDocument();
    expect(screen.queryByText("Should not render")).not.toBeInTheDocument();
  });
});
