import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';
import { contractBody, resetBonitaClient } from '../src/bonita.js';
import { startBonitaStub, type BonitaStub } from './helpers/bonita-stub.js';

/** The section 5 contract example, as the screen form sends it. */
const SANNE = {
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

describe('Callback A: the TOPdesk onboarding form starts the Ofelia case', () => {
  let app: FastifyInstance;
  let stub: BonitaStub;
  let processes: unknown[];
  let instantiation: { status: number; body: unknown };
  const savedEnv = { ...process.env };

  beforeAll(async () => {
    stub = await startBonitaStub({
      routes: (s) => {
        s.get('/bonita/API/bpm/process', async () => processes);
        s.post('/bonita/API/bpm/process/:id/instantiation', async (_req, reply) =>
          reply.code(instantiation.status).send(instantiation.body),
        );
      },
    });
    app = buildServer();
    await app.ready();
  });

  beforeEach(() => {
    app.store.reset();
    stub.calls.length = 0;
    processes = [{ id: '6543210987654321', name: 'MedewerkerOnboarding', activationState: 'ENABLED' }];
    instantiation = { status: 200, body: { caseId: 1042 } };
    process.env.BONITA_URL = stub.url;
    delete process.env.BONITA_ENABLED;
    delete process.env.BONITA_ONBOARDING_PROCESS;
    resetBonitaClient();
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    resetBonitaClient();
  });

  afterAll(async () => {
    await app.close();
    await stub.close();
  });

  const submit = () => request(app.server).post('/admin/topdesk/onboarding').send(SANNE);
  const apiCalls = () => stub.calls.filter((c) => c.url.startsWith('/bonita/API/'));
  const incidentInState = (number: string): any =>
    (app.store.get().topdesk.incidents as any[]).find((i) => i.number === number);
  const actionTexts = (incident: any): string[] => incident.actions.map((a: { text: string }) => a.text);
  const incidentEvents = (id: string) => app.store.events.filter((e) => e.entity === 'incident' && e.id === id);

  it('resolves the enabled process by name, then instantiates it with the exact contract body', async () => {
    await submit();

    const [lookup, start] = apiCalls();
    expect(lookup.method).toBe('GET');
    expect(lookup.url).toBe('/bonita/API/bpm/process?f=name=MedewerkerOnboarding&f=activationState=ENABLED&p=0&c=1');
    expect(start.method).toBe('POST');
    expect(start.url).toBe('/bonita/API/bpm/process/6543210987654321/instantiation');
    expect(start.body).toEqual({
      onboardingInput: {
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
        topdeskIncidentNumber: 'I 2610 009',
      },
    });
  });

  it('stores OFELIA-{caseId} and the start action on the incident, replies the caseId and emits callback_ok', async () => {
    const res = await submit();

    expect(res.status).toBe(201);
    expect(res.body.caseId).toBe('1042');
    expect(res.body.incident.externalNumber).toBe('OFELIA-1042');
    const incident = incidentInState('I 2610 009');
    expect(incident.externalNumber).toBe('OFELIA-1042');
    expect(actionTexts(incident)).toContain('Ofelia case 1042 gestart');
    const ok = incidentEvents(incident.id).find((e) => e.action === 'callback_ok');
    expect(ok?.summary).toBe('Ofelia-proces gestart – case 1042');
  });

  it('accepts a caseId Bonita returns as a string', async () => {
    instantiation = { status: 200, body: { caseId: '2001', processDefinitionId: '6543210987654321' } };

    const res = await submit();

    expect(res.body.caseId).toBe('2001');
    expect(incidentInState('I 2610 009').externalNumber).toBe('OFELIA-2001');
  });

  it('uses BONITA_ONBOARDING_PROCESS to resolve the process', async () => {
    process.env.BONITA_ONBOARDING_PROCESS = 'Onboarding2';

    await submit();

    expect(apiCalls()[0].url).toBe('/bonita/API/bpm/process?f=name=Onboarding2&f=activationState=ENABLED&p=0&c=1');
  });

  it('keeps the incident, adds the error action and emits callback_error when Bonita answers 500', async () => {
    instantiation = { status: 500, body: { message: 'boom' } };

    const res = await submit();

    expect(res.status).toBe(201);
    expect(res.body.caseId).toBeUndefined();
    expect(res.body.ofeliaError).toEqual({ httpStatus: 500, message: 'Fout bij starten Ofelia-proces (HTTP 500)' });
    const incident = incidentInState('I 2610 009');
    expect(incident.externalNumber).toBe('');
    expect(actionTexts(incident)).toContain('Fout bij starten Ofelia-proces');
    const error = incidentEvents(incident.id).find((e) => e.action === 'callback_error');
    expect(error?.summary).toBe('Fout bij starten Ofelia-proces (HTTP 500)');
  });

  it('reports an error when no enabled process has that name, without instantiating', async () => {
    processes = [];

    const res = await submit();

    expect(res.body.ofeliaError.httpStatus).toBe(404);
    expect(apiCalls()).toHaveLength(1);
    expect(actionTexts(incidentInState('I 2610 009'))).toContain('Fout bij starten Ofelia-proces');
  });

  it('reports an error (no crash) when Bonita cannot be reached', async () => {
    process.env.BONITA_URL = 'http://127.0.0.1:1/bonita';

    const res = await submit();

    expect(res.status).toBe(201);
    expect(res.body.ofeliaError).toEqual({ httpStatus: null, message: 'Fout bij starten Ofelia-proces (geen verbinding)' });
    expect(incidentInState('I 2610 009')).toBeDefined();
  });

  it('skips Bonita when BONITA_ENABLED=false and only creates the incident', async () => {
    process.env.BONITA_ENABLED = 'false';

    const res = await submit();

    expect(res.status).toBe(201);
    expect(stub.calls).toHaveLength(0);
    expect(res.body.caseId).toBeUndefined();
    expect(res.body.ofeliaError).toBeUndefined();
    expect(incidentInState('I 2610 009').externalNumber).toBe('');
  });
});

describe('contractBody', () => {
  it('renames mapped fields, drops unmapped ones and keeps values as they are', () => {
    const body = contractBody(
      { firstName: 'Sanne', parking: false, applications: ['SAP'], role: 'Business Analist' },
      { inputName: 'nieuweMedewerker', fields: { firstName: 'voornaam', parking: 'parkeren', applications: 'apps' } },
    );

    expect(body).toEqual({ nieuweMedewerker: { voornaam: 'Sanne', parkeren: false, apps: ['SAP'] } });
  });
});
