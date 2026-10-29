import { palette } from "./palette";

export type ThemeName = "light" | "dark";

export type ThemeColours = {
  surface: string;
  text: string;
  primary: string;
  onPrimary: string;
  primaryText: string;
  viewport: string;
  statusFailFill: string;
  statusFailOnFill: string;
  statusFailText: string;
  statusWarnFill: string;
  statusWarnOnFill: string;
  statusWarnText: string;
  statusWarnBorder: string;
  statusPassFill: string;
  statusPassOnFill: string;
  statusPassText: string;
};

const shared = {
  primary: palette.orange500,
  onPrimary: palette.ink,
  statusFailFill: palette.red600,
  statusFailOnFill: palette.white,
  statusWarnFill: palette.yellow500,
  statusWarnOnFill: palette.ink,
  statusPassFill: palette.green600,
  statusPassOnFill: palette.ink,
} as const;

export const themes: Record<ThemeName, ThemeColours> = {
  light: {
    ...shared,
    surface: palette.cream,
    text: palette.ink,
    primaryText: palette.orange700,
    viewport: palette.cream,
    statusFailText: palette.red700,
    statusWarnText: palette.yellow800,
    statusWarnBorder: palette.yellow700,
    statusPassText: palette.green700,
  },
  dark: {
    ...shared,
    surface: palette.ink,
    text: palette.cream,
    primaryText: palette.orange500,
    viewport: palette.ink,
    statusFailText: palette.red300,
    statusWarnText: palette.yellow400,
    statusWarnBorder: palette.yellow500,
    statusPassText: palette.green400,
  },
};
