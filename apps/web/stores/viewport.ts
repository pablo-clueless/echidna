import { create } from "zustand";

/** Camera moves the 3D view exposes to controls outside the canvas. All of them animate. */
export type CameraCommands = {
  zoomIn: () => void;
  zoomOut: () => void;
  /** Frame the whole board from the current angle. */
  fit: () => void;
  /** Look straight down at the board. */
  top: () => void;
  /** The default three-quarter view. */
  angled: () => void;
  /** A three-quarter view from below, onto the solder side. */
  underside: () => void;
  /** Slide the view by a fraction of the current viewing distance; `y` is up the screen. */
  pan: (x: number, y: number) => void;
};

type ViewportState = {
  /** `null` until the 3D view has loaded. */
  camera: CameraCommands | null;
  setCamera: (camera: CameraCommands | null) => void;
};

/**
 * Bridges the 3D canvas and the DOM around it, such as the camera toolbar and keyboard shortcuts.
 * @returns The viewport store.
 */
export const useViewportStore = create<ViewportState>()((set) => ({
  camera: null,
  setCamera: (camera) => set({ camera }),
}));
