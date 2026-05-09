import { createContext, useContext } from "react";

export const ProductContext = createContext(null);

export function useProductContext() {
  return useContext(ProductContext);
}
