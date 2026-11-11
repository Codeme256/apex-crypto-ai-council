import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { OverviewPage } from "./pages/OverviewPage";
import { CouncilPage } from "./pages/CouncilPage";
import {
  MarketsPage,
  SpotPage,
  FuturesPage,
  RiskPage,
  SimplePage,
} from "./pages/PlaceholderPages";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<OverviewPage />} />
          <Route path="council" element={<CouncilPage />} />
          <Route path="markets" element={<MarketsPage />} />
          <Route path="spot" element={<SpotPage />} />
          <Route path="futures" element={<FuturesPage />} />
          <Route
            path="scanner"
            element={
              <SimplePage
                title="Signal Scanner"
                body="Use AI Trading Council to run scans. Scanner list view can bind to /council/tick history."
              />
            }
          />
          <Route
            path="positions"
            element={
              <SimplePage
                title="Open Positions"
                body="Paper positions are returned from GET /positions on the API after fills."
              />
            }
          />
          <Route
            path="history"
            element={
              <SimplePage
                title="Trade History"
                body="Persist closed paper trades via your deployment database; API-ready."
              />
            }
          />
          <Route path="risk" element={<RiskPage />} />
          <Route
            path="performance"
            element={
              <SimplePage
                title="AI Performance"
                body="No fabricated win rates. Metrics appear only from recorded paper/live closes."
              />
            }
          />
          <Route
            path="news"
            element={
              <SimplePage
                title="News & Sentiment"
                body="Agents report verified events only; unavailable sources are stated explicitly."
              />
            }
          />
          <Route
            path="notifications"
            element={
              <SimplePage
                title="Notifications"
                body="Wire partner webhooks or Telegram from the backend — not from this UI alone."
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
