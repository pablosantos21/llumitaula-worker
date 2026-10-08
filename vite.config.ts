// @ts-check
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Corte #48: la SPA Vite es el build definitivo (salida dist/).
export default defineConfig({
  plugins: [tailwindcss(), react()],
});
