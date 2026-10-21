import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SCREENS, Shell, type ScreenKey } from './components/Shell';
import { Entra } from './screens/Entra';
import { Jira } from './screens/Jira';
import { Overview } from './screens/Overview';
import { Teams } from './screens/Teams';
import { Topdesk } from './screens/Topdesk';
import './index.css';

// Fallback for a screen key without a component in web/src/screens (each renders <Shell screen=...>).
function Placeholder({ screen }: { screen: ScreenKey }) {
  return (
    <Shell screen={screen}>
      <p className="p-6 text-gray-500">Scherm volgt.</p>
    </Shell>
  );
}

const SCREEN_COMPONENTS: Partial<Record<ScreenKey, JSX.Element>> = {
  overview: <Overview />,
  entra: <Entra />,
  jira: <Jira />,
  teams: <Teams />,
  topdesk: <Topdesk />,
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/ui">
      <Routes>
        {(Object.keys(SCREENS) as ScreenKey[]).map((key) => (
          <Route key={key} path={`/${key}`} element={SCREEN_COMPONENTS[key] ?? <Placeholder screen={key} />} />
        ))}
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
