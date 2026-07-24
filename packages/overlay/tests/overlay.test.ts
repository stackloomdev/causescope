import { describe, expect, it } from "vitest";
import type { CauseScopeRuntime } from "@causescope/shared";
import { mountCauseScopeOverlay } from "../src/index";

describe("mountCauseScopeOverlay", () => {
  it("is a no-op when imported in a server runtime", () => {
    expect(mountCauseScopeOverlay({} as CauseScopeRuntime)).toBeNull();
  });
});
