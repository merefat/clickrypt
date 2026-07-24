import { create } from "zustand";

type Theme = "dark";

function applyTheme() {
  if (typeof document === "undefined") return;
  document.documentElement.classList.add("dark");
}

interface ThemeState {
  theme: Theme;
  initTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: "dark",
  initTheme: () => {
    applyTheme();
    set({ theme: "dark" });
  },
}));
