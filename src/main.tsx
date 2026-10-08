import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";

import "./styles/global.css";
import { router } from "./app/router";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing #root element for the Vite shell");
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
