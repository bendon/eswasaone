import { RouterProvider } from "react-router-dom";
import { PwaUpdateBanner } from "./components/PwaUpdateBanner";
import { router } from "./router";

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <PwaUpdateBanner />
    </>
  );
}
