import { useState } from "react";
import "./styles/mt5-launcher.css";

/**
 * Official MT5 browser-entry links only. Credentials stay on the broker's
 * own website, never in APEX. Nothing here calls an order or account API.
 */
const BROKERS = {
  exness: {
    label: "Exness",
    url: "https://www.exness.com/metatrader-webterminal/",
    description: "Exness MetaTrader WebTerminal. Choose MT5 on the official broker page.",
    domain: "exness.com",
    instructions: "On the Exness page, select Launch MetaTrader Web and sign in using your Exness MT5 account details.",
  },
  deriv: {
    label: "Deriv",
    url: "https://deriv.com/trading-platforms/mt5/web-terminal",
    description: "Deriv MT5 Web Terminal. Use Trader's Hub to select the account.",
    domain: "deriv.com",
    instructions: "Sign in to Deriv Trader's Hub, select the MT5 account, then choose the web terminal.",
  },
  demo: {
    label: "MetaTrader 5 demo",
    url: "https://www.metatrader5.com/en/trading-platform/web-trading",
    description: "MetaQuotes web platform demonstration (not a broker account).",
    domain: "metatrader5.com",
    instructions: "Use the official MetaQuotes demonstration if you only want to explore the web terminal.",
  },
} as const;

type Broker = keyof typeof BROKERS;

export default function MT5WebLauncher() {
  const [broker, setBroker] = useState<Broker>("exness");
  const selection = BROKERS[broker];

  return <section className="cc-panel apex-mt5-launcher" id="mt5-web-terminal" aria-labelledby="mt5-launcher-title">
    <div className="cc-panel-head">
      <div>
        <h2 id="mt5-launcher-title">MT5 Web Terminal</h2>
        <p>Open the official broker platform for manual trading or account monitoring.</p>
      </div>
      <span className="cc-chip cc-blue">MANUAL · EXTERNAL</span>
    </div>

    <div className="apex-mt5-layout">
      <div className="apex-mt5-control">
        <label htmlFor="apex-mt5-broker">Choose your broker</label>
        <select id="apex-mt5-broker" value={broker}
          onChange={e=>setBroker(e.target.value as Broker)}>
          <option value="exness">Exness — MT5 WebTerminal</option>
          <option value="deriv">Deriv — MT5 Web Terminal</option>
          <option value="demo">MetaTrader 5 — Demo platform</option>
        </select>
        <p className="cc-hint">{selection.description}</p>
        <a className="apex-mt5-open" href={selection.url} target="_blank" rel="noopener noreferrer">
          Open {selection.label} in new tab ↗
        </a>
        <p className="apex-mt5-domain">Official destination: <strong>{selection.domain}</strong></p>
      </div>
      <div className="apex-mt5-guidance">
        <strong>How to connect</strong>
        <p>{selection.instructions}</p>
        <p>Sign in <strong>only on the broker's official website</strong>. Never enter an MT5 password or server credentials into APEX.</p>
        <p className="apex-mt5-note">This is an external launcher, not an MT5 API bridge. It does not read your account, synchronize positions, run EAs, or execute trades automatically. Manual trades made on the broker's site remain your responsibility.</p>
      </div>
    </div>
  </section>;
}
