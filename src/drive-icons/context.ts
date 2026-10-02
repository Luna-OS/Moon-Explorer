import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import type { Drive } from "@/explorer/sample";
import {
  createLocalDriveIconStore,
  driveKey,
  type DriveIconChoice,
  type DriveIconStore,
} from "./store";

let defaultStore: DriveIconStore | null = null;

/** The app-wide store, created on first use so tests can reset localStorage first. */
function getDefaultStore(): DriveIconStore {
  defaultStore ??= createLocalDriveIconStore();
  return defaultStore;
}

/**
 * Provides the drive icon store. Without a provider the localStorage store
 * is used; the desktop shell or a test can pass its own.
 */
export const DriveIconStoreContext = createContext<DriveIconStore | null>(null);

export function useDriveIconStore(): DriveIconStore {
  return useContext(DriveIconStoreContext) ?? getDefaultStore();
}

/** A drive's custom icon (or `null` for the default), kept up to date. */
export function useDriveIconChoice(drive: Drive): DriveIconChoice | null {
  const store = useDriveIconStore();
  const key = driveKey(drive);
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const getSnapshot = useCallback(() => store.get(key), [store, key]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
