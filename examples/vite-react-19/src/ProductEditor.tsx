import { useState, type ChangeEvent, type ReactElement } from "react";

interface ProductDraft {
  title: string;
  description: string;
  price: string;
  inventory: string;
  category: string;
}

const initialDraft: ProductDraft = {
  title: "Premium Coffee Mug",
  description: "Ceramic mug with a matte finish. Holds 12oz of your favorite brew.",
  price: "24.00",
  inventory: "120",
  category: "Drinkware",
};

export function ProductEditor(): ReactElement {
  const [draft, setDraft] = useState<ProductDraft>(initialDraft);
  const [isDirty, setIsDirty] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const updateDraft = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>): void => {
    const { name, value } = event.target;
    setDraft((current) => ({ ...current, [name]: value }));
    setIsDirty(true);
  };

  const saveDraft = (): void => {
    setIsDirty(false);
  };

  const publish = (): void => {
    setIsPublishing(true);
    window.setTimeout(() => {
      setIsPublishing(false);
      setIsDirty(false);
    }, 700);
  };

  return (
    <main className="playground">
      <header className="page-header">
        <div>
          <div className="title-row">
            <h1>ProductEditor</h1>
            <span className="draft-badge">Draft</span>
          </div>
          <p>Edit product details and publish changes</p>
        </div>
        <span className="save-time">{isDirty ? "Unsaved changes" : "Last saved 2m ago"}</span>
      </header>

      <form className="editor-card" onSubmit={(event) => event.preventDefault()}>
        <label className="field field-wide">
          <span>Title</span>
          <input name="title" value={draft.title} onChange={updateDraft} />
        </label>

        <label className="field field-wide">
          <span>Description</span>
          <textarea name="description" rows={4} value={draft.description} onChange={updateDraft} />
        </label>

        <label className="field">
          <span>Price (USD)</span>
          <span className="input-with-suffix">
            <input name="price" inputMode="decimal" value={draft.price} onChange={updateDraft} />
            <small>USD</small>
          </span>
        </label>

        <label className="field">
          <span>Inventory</span>
          <span className="input-with-suffix">
            <input name="inventory" inputMode="numeric" value={draft.inventory} onChange={updateDraft} />
            <small>In stock</small>
          </span>
        </label>

        <label className="field">
          <span>Category</span>
          <select name="category" value={draft.category} onChange={updateDraft}>
            <option>Drinkware</option>
            <option>Accessories</option>
            <option>Home</option>
          </select>
        </label>

        <div className="field">
          <span>Tags</span>
          <div className="tags" aria-label="Product tags">
            <span>coffee</span>
            <span>mug</span>
            <span>ceramic</span>
          </div>
        </div>

        <footer className="form-actions">
          <button className="secondary-button" type="button" disabled={!isDirty} onClick={saveDraft}>
            Save Draft
          </button>
          <button className="publish-button" type="button" disabled={!isDirty} onClick={publish}>
            {isPublishing ? "Publishing…" : "Publish"}
          </button>
        </footer>
      </form>

      <footer className="page-status" aria-live="polite">
        <span className="status-ring" />
        <strong>{isDirty ? "Changes ready" : "All good"}</strong>
        <span>{isDirty ? "Publish is now available." : "Your changes are saved locally."}</span>
      </footer>
    </main>
  );
}
