/** How each LED colour looks: the dark tinted epoxy when off, and the light it gives when lit. */
export const ledColours: Record<string, { body: string; light: string }> = {
  red: { body: "#5A0A0F", light: "#FF3A2A" },
  yellow: { body: "#6E5306", light: "#FFD028" },
  green: { body: "#0C4420", light: "#3DFF72" },
  blue: { body: "#0F2160", light: "#3D7BFF" },
  white: { body: "#8E949C", light: "#F4F7FF" },
};

export const DEFAULT_LED_COLOUR = "red";
