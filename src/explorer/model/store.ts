import { useSyncExternalStore } from "react";

/**
 * A tiny observable base class. Models mutate their fields and call
 * `changed()`; components re-render through `useStore`.
 */
export class Store {
  private listeners = new Set<() => void>();
  private version = 0;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

  protected changed(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }
}

/** Re-renders the component whenever `store` changes. */
export function useStore(store: Store): number {
  return useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
}
