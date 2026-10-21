import { MonitorPlay } from 'lucide-react';
import { SimulatedBadge } from './SimulatedBadge';

export function Header({ title }: { title: string }) {
  return (
    <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-3">
      <MonitorPlay className="h-5 w-5 text-gray-500" aria-hidden="true" />
      <h1 className="font-semibold">{title}</h1>
      <SimulatedBadge />
    </header>
  );
}
