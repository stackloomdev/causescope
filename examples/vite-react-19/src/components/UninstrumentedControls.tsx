import { createElement, Fragment, type ReactElement } from "react";

type FixtureWindow = typeof window & {
  __CAUSESCOPE_UNINSTRUMENTED_ACTIONS__?: number;
};

function recordUninstrumentedAction(): void {
  const fixtureWindow = window as FixtureWindow;
  fixtureWindow.__CAUSESCOPE_UNINSTRUMENTED_ACTIONS__ =
    (fixtureWindow.__CAUSESCOPE_UNINSTRUMENTED_ACTIONS__ ?? 0) + 1;
}

export function UninstrumentedControls(): ReactElement {
  return createElement(
    Fragment,
    null,
    createElement(
      "a",
      {
        className: "secondary-button",
        href: "#library-new-chat",
        onClick: recordUninstrumentedAction,
      },
      "Library New Chat",
    ),
    createElement(
      "div",
      {
        "aria-checked": false,
        onClick: recordUninstrumentedAction,
        role: "switch checkbox",
      },
      "Library notifications",
    ),
  );
}
