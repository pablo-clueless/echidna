export const palette = {
  orange500: "#DE640E",
  orange700: "#A8480A",
  ink: "#0B0A0D",
  cream: "#FFF6E7",
  white: "#FFFFFF",
  red600: "#D92D20",
  red700: "#B42318",
  red300: "#F97066",
  yellow500: "#EAB308",
  yellow400: "#FACC15",
  yellow700: "#A16207",
  yellow800: "#854D0E",
  green600: "#16A34A",
  green700: "#15803D",
  green400: "#4ADE80",
} as const;

export type PaletteColour = keyof typeof palette;
