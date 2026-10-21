import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SCREENS, Shell, type ScreenKey } from './components/Shell';
import { Teams } from './screens/Teams';
import './index.css';

// Placeholder screens; tickets 08+ replace these with web/src/screens/*.tsx (each renders <Shell screen=...>).
function Placeholder({ screen }: { screen: ScreenKey }) {
  return (
    <Shell screen={screen}>
      <p className="p-6 text-gray-500">Scherm volgt.</p>
    </Shell>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/ui">
      <Routes>
        {(Object.keys(SCREENS) as ScreenKey[]).map((key) => (
          <Route key={key} path={`/${key}`} element={key === 'teams' ? <Teams /> : <Placeholder screen={key} />} />
        ))}
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
