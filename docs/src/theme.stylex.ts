import { createTheme, defineVars } from "@stylexjs/stylex"

export const colors = defineVars({
  background: { default: "#fcfcfb", "@media (prefers-color-scheme: dark)": "#171717" },
  foreground: { default: "#202020", "@media (prefers-color-scheme: dark)": "#ededed" },
  muted: { default: "#676767", "@media (prefers-color-scheme: dark)": "#a0a0a0" },
  faint: { default: "#6b6b6b", "@media (prefers-color-scheme: dark)": "#a0a0a0" },
  line: { default: "#e6e6e3", "@media (prefers-color-scheme: dark)": "#303030" },
  soft: { default: "#f1f1ef", "@media (prefers-color-scheme: dark)": "#202020" },
  panel: { default: "#fff", "@media (prefers-color-scheme: dark)": "#252525" },
  hover: { default: "rgb(0 0 0 / .045)", "@media (prefers-color-scheme: dark)": "rgb(255 255 255 / .065)" },
  selected: { default: "rgb(0 0 0 / .07)", "@media (prefers-color-scheme: dark)": "rgb(255 255 255 / .09)" },
  accent: { default: "#477957", "@media (prefers-color-scheme: dark)": "#b8d3bb" },
  accentSoft: { default: "#e9f0e9", "@media (prefers-color-scheme: dark)": "#253028" },
  selectionBackground: { default: "#dce9dc", "@media (prefers-color-scheme: dark)": "#384a3c" },
  selectionForeground: { default: "#173821", "@media (prefers-color-scheme: dark)": "#eef7ee" },
  copyError: { default: "#9d382e", "@media (prefers-color-scheme: dark)": "#f3aa9d" },
  shadow: {
    default: "0 16px 64px rgb(0 0 0 / .12), 0 2px 8px rgb(0 0 0 / .05)",
    "@media (prefers-color-scheme: dark)": "0 24px 80px rgb(0 0 0 / .35), 0 0 0 1px rgb(255 255 255 / .04)",
  },
})

export const lightTheme = createTheme(colors, {
  background: "#fcfcfb",
  foreground: "#202020",
  muted: "#676767",
  faint: "#6b6b6b",
  line: "#e6e6e3",
  soft: "#f1f1ef",
  panel: "#fff",
  hover: "rgb(0 0 0 / .045)",
  selected: "rgb(0 0 0 / .07)",
  accent: "#477957",
  accentSoft: "#e9f0e9",
  selectionBackground: "#dce9dc",
  selectionForeground: "#173821",
  copyError: "#9d382e",
  shadow: "0 16px 64px rgb(0 0 0 / .12), 0 2px 8px rgb(0 0 0 / .05)",
})

export const darkTheme = createTheme(colors, {
  background: "#171717",
  foreground: "#ededed",
  muted: "#a0a0a0",
  faint: "#a0a0a0",
  line: "#303030",
  soft: "#202020",
  panel: "#252525",
  hover: "rgb(255 255 255 / .065)",
  selected: "rgb(255 255 255 / .09)",
  accent: "#b8d3bb",
  accentSoft: "#253028",
  selectionBackground: "#384a3c",
  selectionForeground: "#eef7ee",
  copyError: "#f3aa9d",
  shadow: "0 24px 80px rgb(0 0 0 / .35), 0 0 0 1px rgb(255 255 255 / .04)",
})
