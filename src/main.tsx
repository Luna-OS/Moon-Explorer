import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./theme/tokens.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Moon Explorer: #root element not found in index.html");
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
