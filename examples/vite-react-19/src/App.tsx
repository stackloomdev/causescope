import type { ReactElement } from "react";
import { ProductEditor } from "./ProductEditor";
import { AccountPage } from "./pages/AccountPage";
import { DataOriginsPage } from "./pages/DataOriginsPage";
import { DiagnosticsPage } from "./pages/DiagnosticsPage";
import { OrdersPage } from "./pages/OrdersPage";

const navigation = [
  { href: "/", label: "Product editor" },
  { href: "/orders", label: "Order queue" },
  { href: "/account", label: "Account" },
  { href: "/origins", label: "Data origins" },
  { href: "/diagnostics", label: "Diagnostics" },
] as const;

function normalizedPathname(): string {
  const pathname = window.location.pathname.replace(/\/+$/, "");
  return pathname || "/";
}

export function App(): ReactElement {
  const pathname = normalizedPathname();
  const page = pathname === "/orders"
    ? <OrdersPage />
    : pathname === "/account"
      ? <AccountPage />
      : pathname === "/origins"
        ? <DataOriginsPage />
        : pathname === "/diagnostics"
          ? <DiagnosticsPage />
      : <ProductEditor />;

  return (
    <div className="scenario-shell">
      <nav className="scenario-nav" aria-label="CauseScope test pages">
        <a className="scenario-wordmark" href="/">CauseScope Lab</a>
        <div className="scenario-links">
          {navigation.map((item) => {
            const isCurrent = item.href === pathname;
            return (
              <a
                className={isCurrent ? "scenario-link scenario-link-active" : "scenario-link"}
                href={item.href}
                aria-current={isCurrent ? "page" : undefined}
                key={item.href}
              >
                {item.label}
              </a>
            );
          })}
        </div>
      </nav>
      {page}
    </div>
  );
}
