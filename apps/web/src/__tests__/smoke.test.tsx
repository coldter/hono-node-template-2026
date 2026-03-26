import { describe, expect, it } from "vitest";
import { render, screen } from "@/__tests__/test-utils";

describe("Smoke Test", () => {
  it("should render a basic element", () => {
    render(<div>Test</div>);
    expect(screen.getByText("Test")).toBeInTheDocument();
  });
});
