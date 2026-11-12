import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import CommandCenter from "./CommandCenter";
import "./styles/index.css";

// One public application, one navigation system. All existing private
// endpoints and D1 wallets are accessed from integrated Command Center panels.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CommandCenter />
  </StrictMode>,
);
