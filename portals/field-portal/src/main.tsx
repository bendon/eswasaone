import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@eswasaone/shared-ui/domains";
import "@eswasaone/shared-ui/styles/field.css";
import "./styles/pwa.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
