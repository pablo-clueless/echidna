"use client";

import { useGroupRef, type Layout } from "react-resizable-panels";
import { useEffect, type ComponentProps } from "react";

import { ResizablePanelGroup } from "@/components/ui/resizable";
import { useLayoutStore } from "@/stores/layout";
import { useHydrated } from "@/lib/persist";

type Props = Omit<ComponentProps<typeof ResizablePanelGroup>, "id" | "groupRef" | "onLayoutChanged"> & {
  id: string;
};

export const PersistedPanelGroup = ({ id, ...props }: Props) => {
  const groupRef = useGroupRef();
  const hydrated = useHydrated(useLayoutStore);

  useEffect(() => {
    if (!hydrated) return;
    const saved = useLayoutStore.getState().layouts[id];
    if (!saved) return;
    try {
      groupRef.current?.setLayout(saved);
    } catch {
      useLayoutStore.getState().saveLayout(id, groupRef.current?.getLayout() ?? {});
    }
  }, [hydrated, id, groupRef]);

  const onLayoutChanged = (layout: Layout) => {
    if (useLayoutStore.persist?.hasHydrated()) useLayoutStore.getState().saveLayout(id, layout);
  };

  return <ResizablePanelGroup id={id} groupRef={groupRef} onLayoutChanged={onLayoutChanged} {...props} />;
};
