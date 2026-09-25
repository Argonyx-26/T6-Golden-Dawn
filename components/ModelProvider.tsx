"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { loadModel, type Model } from "@/lib/model";

const ModelContext = createContext<Model | null>(null);

// null until the model (or mock fallback) is ready.
export function useModel(): Model | null {
  return useContext(ModelContext);
}

// Loads the model once at app start and shares the session with every page.
export function ModelProvider({ children }: { children: React.ReactNode }) {
  const [model, setModel] = useState<Model | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    loadModel()
      .then(setModel)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(load, [load]);

  function retry() {
    setError(null);
    load();
  }

  return (
    <ModelContext.Provider value={model}>
      {!model && !error && (
        <div role="status" className="animate-fade bg-surface-2 px-4 py-2 text-center text-sm text-muted">
          Loading the model…
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b border-danger-border bg-danger-bg px-4 py-2 text-sm text-danger"
        >
          <span>Model failed to load: {error}</span>
          <button type="button" onClick={retry} className="btn btn-danger">
            Retry
          </button>
        </div>
      )}
      {children}
    </ModelContext.Provider>
  );
}
