import { startOnboardingCase, type StartCaseResult } from '../bonita.js';
import type { Store } from '../store.js';
import { createIncident, type CreateIncidentResult, type Incident } from './topdesk-incidents.js';

/** The onboarding form = the section 5 contract fields (without `topdeskIncidentNumber`, which the mock suite adds). */
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

const REQUIRED = ['firstName', 'lastName', 'managerEmail'] as const;

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** `2026-12-01` -> `01-12-2026` (spec 6.6); anything else is shown as given. */
const dutchDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
};

/** Reads the form loosely (screen input); returns an error message when a required field is empty. */
export function parseOnboardingForm(input: unknown): OnboardingForm | string {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return 'The body must be a JSON object';
  const body = input as Record<string, unknown>;
  for (const field of REQUIRED) {
    if (text(body[field]) === '') return `The field '${field}' is required`;
  }
  return {
    firstName: text(body.firstName),
    lastName: text(body.lastName),
    startDate: text(body.startDate),
    department: text(body.department),
    role: text(body.role),
    location: text(body.location),
    equipmentProfile: text(body.equipmentProfile),
    parking: body.parking === true,
    applications: Array.isArray(body.applications) ? body.applications.filter((a): a is string => typeof a === 'string') : [],
    managerEmail: text(body.managerEmail),
  };
}

/**
 * Callback A steps 1-2: creates the `Personeel / Indiensttreding` incident for a new hire, with the
 * manager as caller (via `createIncident`, so numbering, validation and the change event are shared).
 */
export function createOnboardingIncident(store: Store, form: OnboardingForm): CreateIncidentResult {
  const name = `${form.firstName} ${form.lastName}`;
  const request = [
    `Indiensttreding ${name}.`,
    `Startdatum: ${dutchDate(form.startDate) || '–'}`,
    `Afdeling: ${form.department || '–'}`,
    `Functie: ${form.role || '–'}`,
    `Locatie: ${form.location || '–'}`,
    `Werkplekprofiel: ${form.equipmentProfile || '–'}`,
    `Parkeren: ${form.parking ? 'ja' : 'nee'}`,
    `Applicaties: ${form.applications.join(', ') || '–'}`,
    `Leidinggevende: ${form.managerEmail}`,
  ].join('\n');
  return createIncident(store, {
    briefDescription: `Indiensttreding ${name}`.slice(0, 80),
    request,
    callerLookup: { email: form.managerEmail },
    category: { name: 'Personeel' },
    subcategory: { name: 'Indiensttreding' },
    operatorGroup: { name: 'HR' },
  });
}

export type OfeliaStart = { caseId: string } | { ofeliaError: { httpStatus: number | null; message: string } };

const AUTHOR = 'Ofelia Integratie';

/**
 * Callback A steps 3-6: start the Bonita onboarding case for `incident` (via the Bonita client
 * `startOnboardingCase`), then record the outcome on the incident in
 * ONE update (`externalNumber` OFELIA-{caseId} + action, or the error action; event callback_ok/_error).
 * The caller checks `bonitaConfig().enabled` first. Never throws.
 */
export async function startCaseAndRecordOnIncident(store: Store, form: OnboardingForm, incident: Incident): Promise<OfeliaStart> {
  const result: StartCaseResult = await startOnboardingCase({ ...form, topdeskIncidentNumber: incident.number });
  const now = new Date().toISOString();
  // Event summaries are the screen toasts (Shell): green on callback_ok, red on callback_error.
  const okText = result.status === 'ok' ? `Ofelia-proces gestart – case ${result.caseId}` : '';
  const errorText = `Fout bij starten Ofelia-proces (${result.httpStatus === null ? 'geen verbinding' : `HTTP ${result.httpStatus}`})`;
  store.update('topdesk', (t) => {
    const stored = (t.incidents as Incident[]).find((i) => i.id === incident.id) ?? incident;
    stored.bonitaCallback = result;
    stored.updatedAt = now;
    if (result.status === 'ok') {
      stored.externalNumber = `OFELIA-${result.caseId}`;
      stored.actions.push({ date: now, text: `Ofelia case ${result.caseId} gestart`, author: AUTHOR });
      return { entity: 'incident', action: 'callback_ok', id: stored.id, summary: okText };
    }
    stored.actions.push({ date: now, text: 'Fout bij starten Ofelia-proces', author: AUTHOR });
    return { entity: 'incident', action: 'callback_error', id: stored.id, summary: errorText };
  });
  return result.status === 'ok'
    ? { caseId: result.caseId }
    : { ofeliaError: { httpStatus: result.httpStatus, message: errorText } };
}
