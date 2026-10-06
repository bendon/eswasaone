import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { ToastProvider } from "./ui/Toast";
import { CartToastProvider } from "./ui/CartToast";

export default function App() {
  // Cart/toast providers sit above the router so a route error boundary cannot
  // remount the layout outside of them (and so HMR is less brittle).
  return (
    <ToastProvider>
      <CartToastProvider>
        <RouterProvider router={router} />
      </CartToastProvider>
    </ToastProvider>
  );
}
