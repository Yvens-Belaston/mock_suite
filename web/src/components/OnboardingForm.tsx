import { UserPlus, X } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { toast } from './Shell';

/** Section 5 contract fields (the mock adds `topdeskIncidentNumber`). */
export interface OnboardingForm {
  firstName: string;
  lastName: string;
  startDate: string;
  department: string;
  role: string;
  location: string;
  equipmentProfile: string;
  parking: boolean;
  applications: string[];
  managerEmail: string;
}

export const APPLICATIONS = ['SAP', 'Zaaksysteem', 'Decos', 'GIS-viewer'] as const;

/** Demo defaults (spec section 5 example). */
export const SANNE: OnboardingForm = {
  firstName: 'Sanne',
  lastName: 'de Vries',
  startDate: '2026-12-01',
  department: 'Digitalisering',
  role: 'Business Analist',
  location: 'Stadhuis Amstel 1',
  equipmentProfile: 'Standaard laptop',
  parking: false,
  applications: ['SAP', 'Zaaksysteem'],
  managerEmail: 'pieter.bakker@demo-amsterdam.onmicrosoft.com',
};

const EMPTY: OnboardingForm = {
  firstName: '',
  lastName: '',
  startDate: '',
  department: '',
  role: '',
  location: '',
  equipmentProfile: '',
  parking: false,
  applications: [],
  managerEmail: '',
};

const TITLE = 'Nieuwe aanvraag indiensttreding';

/** The tab-bar button plus the form it opens (spec 6.1). Submits to `POST /admin/topdesk/onboarding`. */
export function OnboardingButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ml-auto my-1.5 inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-3 py-1.5 font-medium text-white hover:opacity-90"
      >
        <UserPlus className="h-4 w-4" aria-hidden="true" />
        {TITLE}
      </button>
      {open && <OnboardingDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function OnboardingDialog({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<OnboardingForm>(SANNE);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = <K extends keyof OnboardingForm>(key: K, value: OnboardingForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggleApp = (app: string, on: boolean) =>
    set('applications', on ? APPLICATIONS.filter((a) => a === app || form.applications.includes(a)) : form.applications.filter((a) => a !== app));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/admin/topdesk/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Mock-Source': 'ui' },
        body: JSON.stringify(form),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        toast(`Aanvraag mislukt (${res.status})${body.message ? `: ${body.message}` : ''}`, 'error');
        return;
      }
      // No success toasts here: the change events do it for every viewer ("Melding … aangemaakt", then
      // callback_ok "Ofelia-proces gestart – case …" or a red callback_error with Bonita's HTTP status).
      onClose();
    } catch {
      toast('Aanvraag mislukt: server niet bereikbaar', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <form
        aria-label={TITLE}
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-lg"
      >
        <div className="flex items-start gap-2">
          <h2 className="text-xl font-semibold" style={{ color: 'var(--accent)' }}>
            {TITLE}
          </h2>
          <button type="button" aria-label="Sluiten" onClick={onClose} className="ml-auto rounded p-1 text-gray-500 hover:bg-gray-100">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Voornaam">
            <input required value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
          </Field>
          <Field label="Achternaam">
            <input required value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
          </Field>
          <Field label="Startdatum">
            <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
          </Field>
          <Field label="Afdeling">
            <input value={form.department} onChange={(e) => set('department', e.target.value)} />
          </Field>
          <Field label="Functie">
            <input value={form.role} onChange={(e) => set('role', e.target.value)} />
          </Field>
          <Field label="Locatie">
            <input value={form.location} onChange={(e) => set('location', e.target.value)} />
          </Field>
          <Field label="Werkplekprofiel">
            <input value={form.equipmentProfile} onChange={(e) => set('equipmentProfile', e.target.value)} />
          </Field>
          <Field label="E-mail leidinggevende">
            <input type="email" required value={form.managerEmail} onChange={(e) => set('managerEmail', e.target.value)} />
          </Field>
        </div>
        <fieldset className="mt-4">
          <legend className="text-sm text-gray-600">Applicaties</legend>
          <div className="mt-1 flex flex-wrap gap-4">
            {APPLICATIONS.map((app) => (
              <label key={app} className="inline-flex items-center gap-2">
                <input type="checkbox" checked={form.applications.includes(app)} onChange={(e) => toggleApp(app, e.target.checked)} />
                {app}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="mt-3 inline-flex items-center gap-2">
          <input type="checkbox" checked={form.parking} onChange={(e) => set('parking', e.target.checked)} />
          Parkeervergunning
        </label>
        <div className="mt-5 flex items-center gap-4">
          <button type="button" onClick={() => setForm(EMPTY)} className="text-[var(--accent)] underline hover:opacity-80">
            Wis
          </button>
          <button
            type="submit"
            disabled={busy}
            className="ml-auto rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Indienen
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-gray-600 [&>input]:rounded-md [&>input]:border [&>input]:border-gray-300 [&>input]:px-2 [&>input]:py-1.5 [&>input]:text-base [&>input]:text-gray-900">
      {label}
      {children}
    </label>
  );
}
