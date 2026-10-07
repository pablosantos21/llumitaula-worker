import { createBrowserRouter, Navigate } from "react-router";

import RootLayout from "./RootLayout";
import RequireSession from "./RequireSession";
import ClassesPage from "../routes/ClassesPage";
import IncidentsPage from "../routes/IncidentsPage";
import SetupPage from "../routes/SetupPage";
import WorkersPage from "../routes/WorkersPage";

// Mapa de rutas #42: raíz de clases y comedor protegida, incidencias
// protegida, setup y workers públicas, desconocida redirige a la raíz.
export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        path: "/",
        element: (
          <RequireSession>
            <ClassesPage />
          </RequireSession>
        ),
      },
      {
        path: "/incidencias",
        element: (
          <RequireSession>
            <IncidentsPage />
          </RequireSession>
        ),
      },
      {
        path: "/setup",
        element: <SetupPage />,
      },
      {
        path: "/workers",
        element: <WorkersPage />,
      },
      {
        path: "*",
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);
