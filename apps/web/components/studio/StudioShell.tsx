"use client";

import { usePanelRef } from "react-resizable-panels";
import { useState } from "react";

import { ResizableHandle, ResizablePanel } from "@/components/ui/resizable";
import { ValidatorDrawer } from "./validator/ValidatorDrawer";
import { PersistedPanelGroup } from "./PersistedPanelGroup";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { InspectorPanel } from "./InspectorPanel";
import { LibrarySidebar } from "./LibrarySidebar";
import { SchematicPanel } from "./SchematicPanel";
import { MobileStudio } from "./MobileStudio";
import { Viewport } from "./Viewport";
import { TopBar } from "./TopBar";

const CLAMP = { minSize: "20%", maxSize: "80%" } as const;

const DesktopStudio = () => {
  const libraryRef = usePanelRef();
  const [libraryOpen, setLibraryOpen] = useState(true);

  const toggleLibrary = () => {
    const panel = libraryRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) panel.expand();
    else panel.collapse();
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopBar libraryOpen={libraryOpen} onToggleLibrary={toggleLibrary} />
      <PersistedPanelGroup id="studio" orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel
          id="library"
          panelRef={libraryRef}
          defaultSize="18%"
          minSize="12rem"
          maxSize="30%"
          collapsible
          collapsedSize="0%"
          onResize={(size) => setLibraryOpen(size.inPixels > 0)}
        >
          <LibrarySidebar />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="workspace" minSize="50%">
          <div className="flex h-full flex-col">
            <PersistedPanelGroup id="workspace" orientation="horizontal" className="min-h-0 flex-1">
              <ResizablePanel id="viewport" defaultSize="50%" {...CLAMP}>
                <Viewport />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel id="right" defaultSize="50%" {...CLAMP}>
                <PersistedPanelGroup id="right-column" orientation="vertical">
                  <ResizablePanel id="schematic" defaultSize="50%" {...CLAMP}>
                    <SchematicPanel />
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel id="inspector" defaultSize="50%" {...CLAMP}>
                    <InspectorPanel />
                  </ResizablePanel>
                </PersistedPanelGroup>
              </ResizablePanel>
            </PersistedPanelGroup>
            <ValidatorDrawer />
          </div>
        </ResizablePanel>
      </PersistedPanelGroup>
    </div>
  );
};

/**
 * Studio layout: resizable panels on wider screens, a full-screen viewport with bottom sheets on phones.
 */
export const StudioShell = () => (useMediaQuery("(min-width: 48rem)", true) ? <DesktopStudio /> : <MobileStudio />);
