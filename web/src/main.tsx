import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import './index.css';

// Placeholder screens; tickets 06+ replace these with web/src/screens/*.tsx.
const screens = [
  { path: 'topdesk', title: 'TOPdesk' },
  { path: 'entra', title: 'Entra ID' },
  { path: 'jira', title: 'Jira' },
  { path: 'teams', title: 'Teams' },
  { path: 'overview', title: 'Overzicht' },
];

function Placeholder({ title }: { title: string }) {
  return (
    <div className="min-h-screen bg-white">
      <Header title={title} />
      <main className="p-6 text-gray-500">Scherm volgt.</main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/ui">
      <Routes>
        {screens.map((s) => (
          <Route key={s.path} path={`/${s.path}`} element={<Placeholder title={s.title} />} />
        ))}
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
