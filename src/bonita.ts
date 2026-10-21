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
