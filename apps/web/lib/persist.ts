import { useCallback, useSyncExternalStore } from "react";

type PersistedStore = {
  persist?: {
    hasHydrated: () => boolean;
    onFinishHydration: (listener: () => void) => () => void;
  };
};

const noop = () => {};
const getServerSnapshot = () => false;

/**
 * Reports whether a Zustand `persist` store created with `skipHydration` has loaded from storage.
 * Server renders and the first client render always see `false`, which keeps hydration consistent.
 * On the server Zustand omits the `persist` API entirely, so it is treated as optional.
 * @param store - A Zustand store using the `persist` middleware.
 * @returns `true` once persisted state has been applied.
 */
export const useHydrated = (store: PersistedStore): boolean => {
  const subscribe = useCallback((listener: () => void) => store.persist?.onFinishHydration(listener) ?? noop, [store]);
  const getSnapshot = useCallback(() => store.persist?.hasHydrated() ?? false, [store]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
};
