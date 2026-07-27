import { describe, expect, it } from "vitest";
import type { CauseScopeRuntime, InspectionResult } from "@causescope/shared";
import {
  mountCauseScopeOverlay,
  partitionNetworkRequestsByConfidence,
  partitionPropsForDisplay,
} from "../src/index";

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

  it("does not upgrade a possible network lead to confirmed evidence", () => {
    const confirmed = {
      id: "request-confirmed",
      transport: "fetch" as const,
      method: "GET",
      url: "/api/confirmed",
      startedAt: 1,
    };
    const possible = {
      id: "request-possible",
      transport: "fetch" as const,
      method: "GET",
      url: "/api/possible",
      startedAt: 2,
    };
    const inspection = {
      networkRequests: [confirmed, possible],
      origins: [
        {
          id: "origin-confirmed",
          kind: "network",
          confidence: "confirmed",
          label: "GET /api/confirmed",
          traceId: confirmed.id,
        },
        {
          id: "origin-possible",
          kind: "network",
          confidence: "possible",
          label: "GET /api/possible",
          traceId: possible.id,
        },
      ],
    } as InspectionResult;

    const partitioned = partitionNetworkRequestsByConfidence(inspection);
    expect(partitioned.confirmed).toEqual([confirmed]);
    expect(partitioned.possible).toEqual([possible]);
    expect(partitioned.linked.map(({ confidence }) => confidence)).toEqual(["confirmed", "possible"]);
  });
});
