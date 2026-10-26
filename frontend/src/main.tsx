import { Buffer } from "buffer";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { WalletProvider } from "./stellar/wallet";
import { ToastProvider } from "./components/toasts";
import { Layout } from "./components/Layout";
import { Marketplace } from "./pages/Marketplace";
import { NewLicence } from "./pages/NewLicence";
import { LicenceDetail } from "./pages/LicenceDetail";
import { Admin } from "./pages/Admin";
import { CashOut } from "./pages/CashOut";
import { NotFound, RouteError } from "./components/RouteError";
import "./i18n";
import "./index.css";

// stellar-sdk expects Node's Buffer in the browser.
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer ??= Buffer;

const router = createBrowserRouter([
  {
    element: <Layout />,
    // Only if the layout itself fails: the error page then shows without the header.
    errorElement: <RouteError />,
    children: [
      {
        // A screen that throws is replaced by the error page inside the layout,
        // so the header and the navigation stay usable.
        errorElement: <RouteError />,
        children: [
          { path: "/", element: <Marketplace /> },
          { path: "/new", element: <NewLicence /> },
          { path: "/licence/:id", element: <LicenceDetail /> },
          { path: "/admin", element: <Admin /> },
          { path: "/cash-out", element: <CashOut /> },
          { path: "*", element: <NotFound /> },
        ],
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WalletProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </WalletProvider>
  </StrictMode>,
);
