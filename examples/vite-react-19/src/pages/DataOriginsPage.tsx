import { useQuery } from "@tanstack/react-query";
import { useState, type ReactElement } from "react";
import { usePreferenceStore } from "../stores/preferences";

interface ProductResponse {
  data: {
    product: {
      id: string;
      name: string;
      price: number;
      currency: string;
    };
  };
}

interface PermissionResponse {
  data: {
    role: string;
    canPublish: boolean;
  };
}

function formatCurrency(product: ProductResponse["data"]["product"] | undefined): string {
  return product ? `${product.currency} ${product.price}` : "—";
}

async function fetchProduct(): Promise<ProductResponse> {
  const response = await fetch("/api/products/42?token=causescope-secret");
  if (!response.ok) throw new Error(`Product request failed with ${response.status}`);
  return response.json() as Promise<ProductResponse>;
}

function fetchPermissionsWithXhr(): Promise<PermissionResponse> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", "/api/permissions");
    request.responseType = "json";
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) resolve(request.response as PermissionResponse);
      else reject(new Error(`Permission request failed with ${request.status}`));
    });
    request.addEventListener("error", () => reject(new Error("Permission request failed")));
    request.send();
  });
}

export function DataOriginsPage(): ReactElement {
  const productQuery = useQuery({ queryKey: ["product", "42"], queryFn: fetchProduct });
  const preferences = usePreferenceStore();
  const [permissions, setPermissions] = useState<PermissionResponse | null>(null);
  const [storageRevision, setStorageRevision] = useState(0);
  const storedTheme = localStorage.getItem("causescope-theme");
  const storedWorkspace = sessionStorage.getItem("causescope-workspace");
  const product = productQuery.data?.data.product;

  const toggleStoredTheme = (): void => {
    localStorage.setItem("causescope-theme", storedTheme === "light" ? "dark" : "light");
    setStorageRevision((current) => current + 1);
  };

  const toggleStoredWorkspace = (): void => {
    sessionStorage.setItem("causescope-workspace", storedWorkspace === "secondary" ? "primary" : "secondary");
    setStorageRevision((current) => current + 1);
  };

  const clearStoredValues = (): void => {
    localStorage.removeItem("causescope-theme");
    sessionStorage.removeItem("causescope-workspace");
    setStorageRevision((current) => current + 1);
  };

  const loadPermissions = (): void => {
    void fetchPermissionsWithXhr().then((nextPermissions) => setPermissions(nextPermissions));
  };

  return (
    <main className="playground scenario-page">
      <header className="page-header scenario-heading">
        <div>
          <div className="title-row">
            <h1>Data origins</h1>
            <span className="draft-badge">Fetch · XHR · Cache · Store</span>
          </div>
          <p>Inspect values backed by real runtime adapters instead of illustrative labels.</p>
        </div>
        <span className="save-time">Storage revision {storageRevision}</span>
      </header>

      <section className="origin-grid">
        <article className="scenario-card origin-card">
          <p className="card-eyebrow">Fetch + React Query</p>
          <h2>{productQuery.isPending ? "Loading product…" : product?.name ?? "Product unavailable"}</h2>
          <strong className="origin-value">{formatCurrency(product)}</strong>
          <p>Query key: product / 42</p>
          <button className="secondary-button" type="button" onClick={() => void productQuery.refetch()}>Refetch product</button>
        </article>

        <article className="scenario-card origin-card">
          <p className="card-eyebrow">XMLHttpRequest</p>
          <h2>{permissions ? permissions.data.role : "Permissions not loaded"}</h2>
          <strong className="origin-value">{permissions ? `Can publish: ${permissions.data.canPublish}` : "No response yet"}</strong>
          <p>The response uses <code>responseType = json</code> so object identity remains traceable.</p>
          <button className="secondary-button" type="button" onClick={loadPermissions}>Load permissions</button>
        </article>

        <article className="scenario-card origin-card">
          <p className="card-eyebrow">Zustand</p>
          <h2>{preferences.compact ? "Compact workspace" : "Comfortable workspace"}</h2>
          <strong className="origin-value">Density: {preferences.density}</strong>
          <p>Store updates are linked without automatically discovering unrelated stores.</p>
          <button className="secondary-button" type="button" onClick={preferences.toggleCompact}>Toggle density</button>
        </article>

        <article className="scenario-card origin-card">
          <p className="card-eyebrow">LocalStorage</p>
          <h2>{storedTheme ?? "dark"} theme</h2>
          <strong className="origin-value">Key: causescope-theme</strong>
          <p>Only keys accessed during this page run are recorded.</p>
          <button className="secondary-button" type="button" onClick={toggleStoredTheme}>Toggle stored theme</button>
        </article>

        <article className="scenario-card origin-card">
          <p className="card-eyebrow">SessionStorage</p>
          <h2>{storedWorkspace ?? "primary"} workspace</h2>
          <strong className="origin-value">Key: causescope-workspace</strong>
          <p>The session-scoped key is traced independently from LocalStorage.</p>
          <button className="secondary-button" type="button" onClick={toggleStoredWorkspace}>Toggle session workspace</button>
        </article>
      </section>
      <footer className="storage-controls">
        <span>Storage demo keys are isolated to this page.</span>
        <button className="secondary-button" type="button" onClick={clearStoredValues}>Clear storage demo keys</button>
      </footer>
    </main>
  );
}
