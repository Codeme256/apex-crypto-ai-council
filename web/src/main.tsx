import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import CommandCenter from "./CommandCenter";
import "./styles/index.css";

// Keep the original account, paper-wallet and Binance Testnet UI available
// while making the new verified Council the public landing dashboard.
const originalConsole = new URLSearchParams(window.location.search).get("view") === "console";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {originalConsole ? <App /> : <CommandCenter />}
  </StrictMode>,
);
