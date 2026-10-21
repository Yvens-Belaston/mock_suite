import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface BonitaConfig {
  enabled: boolean;
  url: string;
  user: string;
  password: string;
}

export function bonitaConfig(env: NodeJS.ProcessEnv = process.env): BonitaConfig {
  return {
    enabled: (env.BONITA_ENABLED ?? 'true') !== 'false',
    url: (env.BONITA_URL ?? 'http://bonita:8080/bonita').replace(/\/+$/, ''),
    user: env.BONITA_USER ?? 'walter.bates',
    password: env.BONITA_PASSWORD ?? 'bpm',
  };
}

export interface BonitaClient {
  /** Fetch `{url}{path}` with the session cookies and API token header; logs in first if needed. */
  fetch(path: string, init?: RequestInit): Promise<Response>;
}

interface Session {
  cookie: string;
  token: string;
}

export function createBonitaClient(config: Pick<BonitaConfig, 'url' | 'user' | 'password'>): BonitaClient {
  const baseUrl = config.url.replace(/\/+$/, '');
  let session: Session | undefined;

  async function login(): Promise<Session> {
    const res = await fetch(`${baseUrl}/loginservice`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: config.user, password: config.password, redirect: 'false' }),
    });
    if (res.status < 200 || res.status > 299) {
      throw new Error(`Bonita login failed: ${res.status}`);
    }
    const cookies = new Map<string, string>();
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    const id = cookies.get('JSESSIONID');
    const token = cookies.get('X-Bonita-API-Token');
    if (!id || !token) throw new Error('Bonita login did not return JSESSIONID and X-Bonita-API-Token cookies');
    return { cookie: `JSESSIONID=${id}; X-Bonita-API-Token=${token}`, token };
  }

  async function send(s: Session, path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('cookie', s.cookie);
    headers.set('X-Bonita-API-Token', s.token);
    return fetch(`${baseUrl}${path}`, { ...init, headers });
  }

  return {
    async fetch(path, init = {}) {
      session ??= await login();
      const res = await send(session, path, init);
      if (res.status !== 401) return res;
      // Session expired (e.g. Bonita restarted): log in again and retry exactly once.
      session = await login();
      return send(session, path, init);
    },
  };
}

let defaultClient: BonitaClient | undefined;

/**
 * Call Bonita using the BONITA_* environment variables. The session is created on the first call and
 * cached for the process; a 401 triggers one re-login and retry. Throws when BONITA_ENABLED=false,
 * so callers should check `bonitaConfig().enabled` and skip the callback instead.
 */
export async function bonitaFetch(path: string, init?: RequestInit): Promise<Response> {
  const config = bonitaConfig();
  if (!config.enabled) throw new Error('Bonita is disabled (BONITA_ENABLED=false)');
  defaultClient ??= createBonitaClient(config);
  return defaultClient.fetch(path, init);
}

/** Forget the cached session (tests only). */
export function resetBonitaClient(): void {
  defaultClient = undefined;
}

/** Outcome of a callback into Bonita, stored on the mock record (e.g. `issue.bonitaCallback`). */
export interface BonitaCallbackResult {
  status: 'ok' | 'error';
  /** Bonita's HTTP status; `null` when Bonita could not be reached or login failed. */
  httpStatus: number | null;
  at: string;
}

/** Message values carry their Java type explicitly, else Bonita may guess Integer for the Long (spec section 5). */
const str = (value: string) => ({ value, type: 'java.lang.String' });
const long = (value: string) => ({ value, type: 'java.lang.Long' });

/**
 * Callback B (spec section 5): tell onboarding case `caseId` that Jira issue `issueKey` is Done.
 * Message name and target process come from BONITA_MESSAGE_ACCESS / BONITA_ONBOARDING_PROCESS.
 * Never throws: any failure comes back as `status: 'error'`. Callers skip it when Bonita is disabled.
 */
export async function sendAccessGranted(
  msg: { caseId: string; issueKey: string; resolvedBy: string },
  env: NodeJS.ProcessEnv = process.env,
): Promise<BonitaCallbackResult> {
  const body = {
    messageName: env.BONITA_MESSAGE_ACCESS ?? 'accessGranted',
    targetProcess: env.BONITA_ONBOARDING_PROCESS ?? 'MedewerkerOnboarding',
    correlations: { caseId: long(msg.caseId), issueKey: str(msg.issueKey) },
    messageContent: { issueKey: str(msg.issueKey), resolvedBy: str(msg.resolvedBy) },
  };
  let httpStatus: number | null = null;
  try {
    const res = await bonitaFetch('/API/bpm/message', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    httpStatus = res.status;
  } catch {
    // Unreachable or login refused: reported as an error result, never a crash.
  }
  const ok = httpStatus !== null && httpStatus >= 200 && httpStatus <= 299;
  return { status: ok ? 'ok' : 'error', httpStatus, at: new Date().toISOString() };
}

/** `config/bonita-contract.json`: form field -> contract field, under one contract input (spec section 5). */
export interface BonitaContract {
  inputName: string;
  fields: Record<string, string>;
}

export const DEFAULT_CONTRACT_FILE = fileURLToPath(new URL('../config/bonita-contract.json', import.meta.url));

/** Read on every call so the presenter can edit the mounted file without a restart. */
export function loadContract(file: string = DEFAULT_CONTRACT_FILE): BonitaContract {
  return JSON.parse(readFileSync(file, 'utf8')) as BonitaContract;
}

/** Rename and drop only: form fields missing from `contract.fields` are not sent; values pass through untouched. */
export function contractBody(input: Record<string, unknown>, contract: BonitaContract): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [formField, contractField] of Object.entries(contract.fields)) {
    if (formField in input) mapped[contractField] = input[formField];
  }
  return { [contract.inputName]: mapped };
}

/** Outcome of callback A; `caseId` is always a string, whatever type Bonita returned. */
export type StartCaseResult =
  | { status: 'ok'; caseId: string; httpStatus: number; at: string }
  | { status: 'error'; httpStatus: number | null; at: string };

const is2xx = (status: number) => status >= 200 && status <= 299;

/**
 * Callback A (spec section 5): resolve the enabled BONITA_ONBOARDING_PROCESS and instantiate it with the
 * contract built from `input` (see `contractBody`). Never throws: no enabled process -> error with
 * httpStatus 404; unreachable/login failure -> `httpStatus: null`. Callers skip it when Bonita is disabled.
 */
export async function startOnboardingCase(
  input: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<StartCaseResult> {
  const at = () => new Date().toISOString();
  const name = env.BONITA_ONBOARDING_PROCESS ?? 'MedewerkerOnboarding';
  let httpStatus: number | null = null;
  try {
    const lookup = await bonitaFetch(`/API/bpm/process?f=name=${encodeURIComponent(name)}&f=activationState=ENABLED&p=0&c=1`);
    httpStatus = lookup.status;
    if (!is2xx(lookup.status)) return { status: 'error', httpStatus, at: at() };
    const [proc] = (await lookup.json()) as { id?: string | number }[];
    if (proc?.id === undefined) return { status: 'error', httpStatus: 404, at: at() };

    const start = await bonitaFetch(`/API/bpm/process/${encodeURIComponent(String(proc.id))}/instantiation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(contractBody(input, loadContract())),
    });
    httpStatus = start.status;
    if (!is2xx(start.status)) return { status: 'error', httpStatus, at: at() };
    const { caseId } = (await start.json()) as { caseId?: string | number | null };
    if (caseId === undefined || caseId === null || caseId === '') return { status: 'error', httpStatus, at: at() };
    return { status: 'ok', caseId: String(caseId), httpStatus, at: at() };
  } catch {
    // Unreachable, login refused or an unreadable reply: an error result, never a crash.
    return { status: 'error', httpStatus, at: at() };
  }
}
