// @ts-check
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Scaffold transitorio #43: la SPA Vite convive con Astro hasta que #48
// elimine el legacy y convierta este build en el corte definitivo.
export default defineConfig({
  plugins: [tailwindcss(), react()],
  build: {
    outDir: "dist-vite",
  },
});
