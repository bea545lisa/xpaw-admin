import { createContext, useContext } from "react";

export const ColorSchemeContext = createContext({
  colorScheme: "light",  // "light" | "dark"
  toggle: () => {},
});


export function useColorScheme() {
  return useContext(ColorSchemeContext);
}
