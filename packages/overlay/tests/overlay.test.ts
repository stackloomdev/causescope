import { describe, expect, it } from "vitest";
import type { CauseScopeRuntime } from "@causescope/shared";
import { mountCauseScopeOverlay, partitionPropsForDisplay } from "../src/index";

describe("mountCauseScopeOverlay", () => {
  it("is a no-op when imported in a server runtime", () => {
    expect(mountCauseScopeOverlay({} as CauseScopeRuntime)).toBeNull();
  });

  it("keeps available Props and counts unavailable values without rendering undefined rows", () => {
    const available = {
      componentName: "MenuButton",
      name: "label",
      relationship: "component" as const,
      value: "My Site",
    };
    const unavailable = {
      componentName: "TooltipTrigger",
      name: "aria-describedby",
      relationship: "ancestor" as const,
      value: undefined,
    };

    expect(partitionPropsForDisplay([available, unavailable])).toEqual({
      visibleProps: [available],
      hiddenUnavailableProps: 1,
    });
  });
});
