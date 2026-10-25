import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // stellar-sdk references `global` in a few browser code paths.
  define: { global: "globalThis" },
});
