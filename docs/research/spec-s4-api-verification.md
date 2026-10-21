# Spec §4 API contracts: check against vendor docs

Checked on 2026-10-21 against `docs/spec.md` (working copy, §4 lines 88–193, plus data-model lines 64–67 where API payloads depend on them).

**In plain words:** The spec promises that a Bonita connector built against the mock will work unchanged when pointed at a real TOPdesk, Entra (Microsoft Graph), Jira or Teams tenant. I checked every route, field and status code in §4 against the vendors' own published references. Most of it holds. A handful of items would break, or silently behave differently, on a real tenant.

**Sources used (primary only):**
- TOPdesk: the OpenAPI files that the TOPdesk API explorer (`https://developers.topdesk.com/explorer/`) loads from `https://developers.topdesk.com/swagger/…`. Versions used: Incident 4.2.10, Change 1.42.0, Supporting Files 2.7.12 (current) and 1.58.0 (the "legacy" persons format, no `Accept` header), General 1.2.0. Also the TOPdesk tutorial.
- Microsoft Graph v1.0: learn.microsoft.com reference pages. I read their Markdown source in Microsoft's `microsoft-graph-docs-contrib` repo, which is the same content.
- Entra token endpoint: the Microsoft identity platform client-credentials page.
- Jira Cloud: Atlassian's published v3 OpenAPI (`swagger-v3.v3.json`) and the developer.atlassian.com guides.
- Teams: the Teams platform docs, the Power Automate Teams connector reference, and the Logic Apps Request-trigger docs (the Workflows trigger runs on Logic Apps).

Nothing was behind a login. Items marked ⚠️ are either tenant-configuration dependent or not stated in any vendor doc.

---

## 1. Summary

| Vendor | ✅ match | ❌ mismatch | ⚠️ partial / unverifiable |
| --- | --- | --- | --- |
| Cross-cutting (§4 intro, line 90) | 0 | 1 | 1 |
| TOPdesk (§4.1, §4.2) | 16 | 4 | 7 |
| Microsoft Graph + token (§4.1, §4.3) | 14 | 0 | 8 |
| Jira Cloud (§4.1, §4.4) | 9 | 0 | 4 |
| Teams Workflows (§4.1, §4.5) | 4 | 1 | 4 |
| Admin routes (§4.6) | 1 | 0 | 0 |
| **Total** | **44** | **6** | **24** |

### Top risks for "works on a real tenant"

1. **TOPdesk change numbers have the wrong format** (lines 65, 83). Real numbers look like `C 1604 0003` (spaces, same style as incidents). The spec uses `C2610-001`. Any regex, lookup by number, or `externalNumber` correlation built on the mock format fails on a real tenant.
2. **The TOPdesk change status update is not a documented operation** (line 111). `replace /processingStatus` on `/operatorChanges/{id}` is missing from TOPdesk's list of updatable paths. It appears only in a sample body. The documented ways are `POST /operatorChanges/{id}/processingStatusTransitions` (`{"from":…, "action":"start"|"implement"|…}`), or patching `/status` when the tenant's "status determines processing status" setting is on. A connector that works on the mock may get `400` on a real tenant.
3. **New TOPdesk changes start in a different status** (line 109). The docs say a new change is created in the `rfc` phase, or `prfc` if preliminary RfCs are enabled. It does not start at `simple_notStarted`. The mock skips the request-for-change phase, so Bonita never learns to handle it.
4. **Unknown fields: the mock accepts what TOPdesk rejects** (line 90). The spec says "accept and ignore unknown fields", but TOPdesk documents `400 – The request contains a field that does not exist` on incident POST/PATCH and person POST. A typo in a connector field name passes on the mock and fails on the real tenant. This also breaks the spec's own rule, "be exactly as strict as the real API".
5. **Graph returns only a small default set of user properties** (line 123). Without `$select`, real Graph returns only `businessPhones, displayName, givenName, id, jobTitle, mail, mobilePhone, officeLocation, preferredLanguage, surname, userPrincipalName`. `accountEnabled`, `department`, `employeeHireDate`, `usageLocation` and `assignedLicenses` all "require `$select` to retrieve". If the mock returns everything by default, a connector that reads `accountEnabled` from a plain GET works on the mock and gets `undefined` in production.
6. **TOPdesk list endpoints can return `206 Partial Content`** (lines 108, 113). Real list endpoints return `206` (plus an `x-next-page-url` header for incidents) when more results exist. The default `pageSize` is 10 for incidents and 50 for persons. The spec only mentions `200` and `204`, so a client that treats only `200` as success breaks on a busy tenant.
7. **Teams auth and payload details differ** (lines 97, 157, 168). A Workflows webhook needs no auth only if the trigger is set to "Anyone". "Any user in my tenant" or "Specific users" requires an OAuth bearer token. Also, `msteams.style` is not a documented Adaptive Card property, so Teams will not show the escalation styling the screen relies on.

---

## 2. Per-vendor verification

### 2.0 Cross-cutting (§4 intro)

| Spec item (line) | Verdict | What the real API says | Source |
| --- | --- | --- | --- |
| "Accept and ignore unknown fields" (90) | ❌ | TOPdesk incident POST/PATCH return `400` when "The request contains a field that does not exist". Person POST returns `400 The field "<fieldname>" does not exist.` Graph and Jira don't document either way. | [TOPdesk incident spec](https://developers.topdesk.com/swagger/incident_specification_4.2.10.yaml) (`/incidents` post 400), [Supporting Files spec](https://developers.topdesk.com/swagger/supporting-files_specification_2.7.12.yaml) (`/persons` post 400) |
| "Verified against the vendors' published OpenAPI files" (90) | ⚠️ | TOPdesk and Jira publish OpenAPI files. For Graph I used the reference pages, not the CSDL/OpenAPI metadata. Microsoft publishes no OpenAPI for the Teams Workflows trigger. | [TOPdesk explorer](https://developers.topdesk.com/explorer/), [Jira OpenAPI](https://developer.atlassian.com/cloud/jira/platform/swagger-v3.v3.json), [Teams connector ref](https://learn.microsoft.com/en-us/connectors/teams/#microsoft-teams-webhook) |

### 2.1 TOPdesk (`/tas/api`)

| Spec item (line) | Verdict | What the real API says | Source |
| --- | --- | --- | --- |
| Auth: `Authorization: Basic …`, missing → `401` (94) | ✅ | Basic auth with the operator login name and an *application password*. `401` = "No authentication token provided". | [TOPdesk tutorial](https://developers.topdesk.com/tutorial.html), [incident spec](https://developers.topdesk.com/swagger/incident_specification_4.2.10.yaml) |
| Base path `/tas/api` (99) | ✅ | `servers: - url: /tas/api` (incident). `basePath: /tas/api` (change). | [incident spec](https://developers.topdesk.com/swagger/incident_specification_4.2.10.yaml), [change spec](https://developers.topdesk.com/swagger/change_specification_1.42.0.yaml) |
| `GET /tas/api/version` → `{"version":…}` (103) | ✅ | `GET /version` → `200 {"version": string}` | [general spec](https://developers.topdesk.com/swagger/general_specification_1.2.0.yaml) |
| `POST /incidents` → `201` + full incident (104) | ✅ | `201` + `Incident` schema | [incident spec](https://developers.topdesk.com/swagger/incident_specification_4.2.10.yaml) |
| `callerLookup.email` accepted (104) | ✅ | `"callerLookup": { "email": "email@domain.com" }` is a documented form, as is `{ "id": … }`. "It is an error to provide more than one lookup value." | same, `IncidentCreateBody.callerLookup` |
| Required: `briefDescription`; `caller` or `callerLookup` (104) | ⚠️ | `IncidentCreateBody` has no `required` list, and the request body is `required: false`. Real mandatory fields depend on tenant settings. `briefDescription` maxLength is 80 (real returns `400` when it is longer). Requiring these fields is stricter than documented. | same |
| Incident `number` format `I 2610 001` (64) | ✅ | Example `I 2011 007` | same, `Incident.number` |
| `GET /incidents/id/{id}`, `GET /incidents/number/{number}` → incident or `404` (105–106) | ✅ | Both paths exist. `404` = "incident … doesn't exist". | same |
| `PATCH /incidents/id/{id}` and `/number/{number}` → `200` + incident; fields `action`, `processingStatus.name`, `closed`, `externalNumber`, `operatorGroup.name` (107) | ✅ | PATCH (and PUT) exist on both paths and return `200` + `Incident`. `IncidentUpdateBody` contains all five fields. `processingStatus`/`operatorGroup` take `id` or `name`. | same |
| `GET /incidents?query=&pageSize=&pageStart=` → array or `204` (108) | ⚠️ | `200` array, `204` none, **`206` "there are more incidents" with header `x-next-page-url`**. Default pageSize is 10 (max 10000). By default only firstLine and secondLine incidents are returned (`all=true` overrides). | same, `/incidents` get |
| FIQL `closed==false`, `externalNumber==X` (108) | ✅ | `query` is FIQL. "All fields from the returned resource should be available." | same; [tutorial](https://developers.topdesk.com/tutorial.html#query) |
| Incident GET `action` is a link, not an array (117) | ✅ | `action: type string, format url – "The list endpoint where the separate action entries can be retrieved"`. `/incidents/id/{id}/actions` exists. | same |
| `POST /operatorChanges`; `briefDescription` + `changeType` unless `template` (109) | ✅ | "If template is provided, then brief description and change type are not required." `changeType` enum `simple`/`extensive`. `201` + `OperatorChangeDetails`. | [change spec](https://developers.topdesk.com/swagger/change_specification_1.42.0.yaml) |
| Required `requester.id` (109) | ❌ | `MinimalOperatorChange.required: [requester]`. The requester can be given by `id`, `identifier` (UUID, email or compound name) or `name` (unregistered). Requiring `id` is stricter than the real API. | same, `Requester` |
| New change `processingStatus = simple_notStarted` (109) | ❌ | "If no phases are provided, only rfc and progress are created. … If prfcs are disabled in the settings the change will be created in the rfc phase." So a new change starts at `rfc` or `prfc`. The enum includes `prfc`, `rfc`, `rejected`, `simple_*`, `extensive_*`. | same, `/operatorChanges` post, `OperatorChangeDetails.processingStatus` |
| Change number format `C2610-001` (65, 83) | ❌ | Examples are `C 1604 0003` (details) and `C 1608 004` (path examples): "C", space, 4 digits, space, digits. | same |
| `processingStatus` values `simple_notStarted/inProgress/done/closed` (65) | ✅ | All four are in the enum. | same |
| `requester {id, name}` in responses (65) | ✅ | `ChangeRequester` has `id`, `name`, `branch`, `location`. | same |
| `GET /operatorChanges/{id}` → change or `404` (110) | ✅ | Path is `/operatorChanges/{identifier}` ("Id or number"). `404` = "No such change". | same |
| `PATCH /operatorChanges/{id}`, `application/json-patch+json`, `204` (111) | ✅ | `consumes: application/json-patch+json`; `204 Success`. RFC 6902 steps. | same |
| JSON Patch `add /progressTrail` with text value (111) | ✅ | "The requests and progressTrail allows **only text** as value. The only operation possible for "/requests" and "/progressTrail" is add." | same |
| JSON Patch `replace /processingStatus` (111) | ❌ | `/processingStatus` is **not** in the documented list of updatable fields for `operatorChanges`. That list has `/status`. It only shows up in one sample body. Phase changes are documented as `POST /operatorChanges/{identifier}/processingStatusTransitions` with `{"from":"simple_inProgress","action":"implement"}` → `201`, "Only works if 'status determines processing status' is turned off". `/processingStatus` is listed for `operatorChangeActivities`, not changes. | same, `/operatorChanges/{identifier}` patch, `/processingStatusTransitions`, `MinimalProcessingStatusTransition` |
| `POST /operatorChanges/{id}/progresstrail` body "progress trail text" → `201` (112) | ⚠️ | Path and `201` (`MemoEntry`) match. The body must be `{"memoText": "...", "type": "memo"}`; both are required, and `textFormatting` (`plain`/`html`) is optional. Path `id` is a UUID only, not a number. | same, `MinimalProgressTrailEntry` |
| `GET /persons?query=email=={email}`, legacy format, array or `204` (113) | ⚠️ | Legacy (no `Accept` v2): `200` array of `PersonDto`, `204` "No entities found", **`206`** when more than page size. Email filtering works ("All top-level fields … except status and city"). Note: "When query parameter is used both archived and non-archived persons are returned by default". Add `;archived==false` if Bonita expects active persons only. | [Supporting Files 1.58.0 (legacy)](https://developers.topdesk.com/swagger/supporting-files_specification_1.58.0.yaml) |
| `POST /persons` required `surName` → `201` (114) | ⚠️ | V2 (`Accept: application/x.topdesk-person-v2+json`) requires only `surName`. **Legacy (no Accept header) `CreatePersonDto` requires `branch` and `surName`.** Which applies depends on the header the connector sends. | [Supporting Files 2.7.12](https://developers.topdesk.com/swagger/supporting-files_specification_2.7.12.yaml), [1.58.0](https://developers.topdesk.com/swagger/supporting-files_specification_1.58.0.yaml) |
| `PATCH /persons/id/{id}/archive` `{"id":reasonId}` optional → `200` + person (115) | ⚠️ | PATCH (and PUT) exist, returning `200` + `PersonDto`. Reason: "Mandatory when no default reason is set." Real returns `400 Reason for archiving is mandatory` on tenants without a default reason. It also returns `400 Person is already archived`, which the spec doesn't mention. | [Supporting Files 2.7.12](https://developers.topdesk.com/swagger/supporting-files_specification_2.7.12.yaml) |
| Error body "in the vendor's error style" (90) | ⚠️ | Persons endpoints: JSON array of `{"message": "..."}`. Incident and change endpoints define no 4xx body (`content: {}`). The spec should name the shape. | same |

### 2.2 Microsoft Graph v1.0 and token endpoint

| Spec item (line) | Verdict | What the real API says | Source |
| --- | --- | --- | --- |
| `POST /{tenantId}/oauth2/v2.0/token`, form-encoded, `grant_type=client_credentials`, `client_id`, `client_secret`, `scope` (95) | ✅ | Same path and parameters, all marked "Required". Host `login.microsoftonline.com`. `Content-Type: application/x-www-form-urlencoded`. | [Client credentials flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow) |
| `client_secret` must be in the form body (95) | ⚠️ | "The Basic auth pattern of instead providing credentials in the Authorization header, per RFC 6749 is also supported." A client that uses Basic would get `400` from the mock. | same |
| Response `{"token_type":"Bearer","expires_in":3599,"access_token":…}` (95) | ✅ | Example response is exactly these three fields. | same |
| Missing param → `400 invalid_request` (95) | ⚠️ | `invalid_request` is the standard OAuth code. Entra errors are a **flat** object, `{"error","error_description","error_codes","timestamp","trace_id","correlation_id"}`, not Graph's `{"error":{code,message}}`. The spec doesn't say which shape the mock uses. | same; [RFC 6749 §5.2](https://datatracker.ietf.org/doc/html/rfc6749#section-5.2) |
| Graph routes need `Authorization: Bearer …` (95) | ✅ | "Authorization: Bearer {token}. Required." on every page | [Get user](https://learn.microsoft.com/en-us/graph/api/user-get?view=graph-rest-1.0) |
| `GET /users/{id or UPN}`, respect `$select` (123) | ⚠️ | The path accepts `{id | userPrincipalName}` and supports `$select`. **By default only `businessPhones, displayName, givenName, id, jobTitle, mail, mobilePhone, officeLocation, preferredLanguage, surname, userPrincipalName` are returned.** `accountEnabled`, `department`, `employeeHireDate`, `usageLocation`, `mailNickname` and `assignedLicenses` need `$select`. | [Get user](https://learn.microsoft.com/en-us/graph/api/user-get?view=graph-rest-1.0), [user resource](https://learn.microsoft.com/en-us/graph/api/resources/user?view=graph-rest-1.0) |
| Unknown user → `404` code `Request_ResourceNotFound` (123) | ⚠️ | `404 Not Found` is documented. The code `Request_ResourceNotFound` appears nowhere in the Graph reference. The error docs also say "Don't take any dependency on the content of [message]". | [Get user](https://learn.microsoft.com/en-us/graph/api/user-get?view=graph-rest-1.0), [Graph errors](https://learn.microsoft.com/en-us/graph/errors) |
| `GET /users?$filter=userPrincipalName eq '…'` / `mail eq` → `{"value":[…]}` (124) | ✅ | `$filter` is supported. `mail` supports `eq` (and more). `userPrincipalName` supports `eq`. Neither needs `ConsistencyLevel` for plain `eq`. The real response also has `@odata.context` and may have `@odata.nextLink`. | [List users](https://learn.microsoft.com/en-us/graph/api/user-list?view=graph-rest-1.0), [user resource](https://learn.microsoft.com/en-us/graph/api/resources/user?view=graph-rest-1.0) |
| `POST /users` required `accountEnabled, displayName, mailNickname, userPrincipalName, passwordProfile.password` → `201` (125) | ✅ | Required table: `accountEnabled`, `displayName`, `mailNickname`, `passwordProfile`, `userPrincipalName`, plus `onPremisesImmutableId` for federated domains only. `201 Created` + user. The password is never shown in the response example. | [Create user](https://learn.microsoft.com/en-us/graph/api/user-post-users?view=graph-rest-1.0) |
| Duplicate UPN → `400 Request_BadRequest`, message contains `already exists` (125) | ⚠️ | No duplicate-UPN error is documented for create user. The wording "Another object with the same value for property … already exists." appears officially only as a `PropertyConflict` detail in `validateProperties`. Microsoft warns against depending on `message`. | [Create user](https://learn.microsoft.com/en-us/graph/api/user-post-users?view=graph-rest-1.0), [group validateProperties](https://learn.microsoft.com/en-us/graph/api/group-validateproperties?view=graph-rest-1.0), [Graph errors](https://learn.microsoft.com/en-us/graph/errors) |
| `PATCH /users/{id}` → `204` (126) | ✅ | `PATCH /users/{id | userPrincipalName}` → `204 No Content` | [Update user](https://learn.microsoft.com/en-us/graph/api/user-update?view=graph-rest-1.0) |
| `PUT /users/{id}/manager/$ref`, `@odata.id` → `204` (127) | ✅ | `PUT /users/{id}/manager/$ref`, body `{"@odata.id":"https://graph.microsoft.com/v1.0/users/{id}"}`, `204 No Content` | [Assign manager](https://learn.microsoft.com/en-us/graph/api/user-post-manager?view=graph-rest-1.0) |
| `GET /users/{id}/memberOf` → `{"value":[{"@odata.type":"#microsoft.graph.group",id,displayName}]}` (128) | ✅ | `GET /users/{id | userPrincipalName}/memberOf`. Items are directoryObjects with `@odata.type` `#microsoft.graph.group` (directory roles can appear too). `$filter` there needs `ConsistencyLevel: eventual` plus `$count`. | [List memberOf](https://learn.microsoft.com/en-us/graph/api/user-list-memberof?view=graph-rest-1.0) |
| `POST /users/{id}/assignLicense` `addLicenses[]`, `removeLicenses[]` → `200` + user (129) | ✅ | Same path, `200 OK` + user. `removeLicenses` is "Required. Can be an empty collection." | [assignLicense](https://learn.microsoft.com/en-us/graph/api/user-assignlicense?view=graph-rest-1.0) |
| (implied) license needs `usageLocation` (79) | ⚠️ | `usageLocation` is "Required for users that are assigned licenses". The real API rejects assignLicense when it is missing. The spec seeds `NL` but doesn't say whether the mock checks it. | [user resource](https://learn.microsoft.com/en-us/graph/api/resources/user?view=graph-rest-1.0) |
| `POST /users/{id}/revokeSignInSessions` → `200 {"value":true}` (130) | ✅ | Example `200 OK {"@odata.context":"…$metadata#Edm.Boolean","value":true}`. The docs promise only "a 2xx series response code". | [revokeSignInSessions](https://learn.microsoft.com/en-us/graph/api/user-revokesigninsessions?view=graph-rest-1.0) |
| `signInSessionsRevokedAt` user field (67) | ⚠️ | The real property is `signInSessionsValidFromDateTime`. Fine as an internal name, but it must not appear in `GET /users` responses under that name. | [user resource](https://learn.microsoft.com/en-us/graph/api/resources/user?view=graph-rest-1.0) |
| `POST /groups/{id}/members/$ref` → `204`; already member → `400` (131) | ✅ | "returns a `204 No Content` … It returns a `400 Bad Request` response code when the object is already a member of the group". `404` if the object doesn't exist. Doc example `@odata.id` uses `…/v1.0/directoryObjects/{id}`. | [Add members](https://learn.microsoft.com/en-us/graph/api/group-post-members?view=graph-rest-1.0) |
| `DELETE /groups/{id}/members/{userId}/$ref` → `204` (132) | ✅ | `DELETE /groups/{id}/members/{id}/$ref` → `204 No Content` | [Remove member](https://learn.microsoft.com/en-us/graph/api/group-delete-members?view=graph-rest-1.0) |
| `GET /groups?$filter=displayName eq '…'` (133) | ✅ | Group `displayName` supports `$filter` `eq`. | [List groups](https://learn.microsoft.com/en-us/graph/api/group-list?view=graph-rest-1.0), [group resource](https://learn.microsoft.com/en-us/graph/api/resources/group?view=graph-rest-1.0) |
| "Every `/v1.0/users/{x}` route accepts id or UPN" (135) | ⚠️ | True for GET, PATCH, memberOf, assignLicense and revokeSignInSessions (all documented `{id | userPrincipalName}`). **The manager `$ref` page documents only `{id}`.** | [Assign manager](https://learn.microsoft.com/en-us/graph/api/user-post-manager?view=graph-rest-1.0) |
| Graph error shape `{"error":{"code","message"}}` (137) | ✅ | `{"error":{"code","message","innerError":{…},"details":[]}}`; `innerError`/`details` optional | [Graph errors](https://learn.microsoft.com/en-us/graph/errors) |

### 2.3 Jira Cloud REST v3

| Spec item (line) | Verdict | What the real API says | Source |
| --- | --- | --- | --- |
| Auth `Authorization: Basic …` (96) | ✅ | `Basic base64(email:api_token)`. "Authentication using passwords has been deprecated." | [Basic auth for REST APIs](https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/) |
| `GET /rest/api/3/myself` → user (143) | ✅ | `getCurrentUser` → `200 User` (`accountId, displayName, emailAddress, active, …`) | [Myself](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-myself/#api-rest-api-3-myself-get) |
| `GET /rest/api/3/user/search?query={email}` → array (144) | ⚠️ | `200` array of `User`. `query` matches `displayName` and `emailAddress`. **"Privacy controls are applied … the user's email address is hidden."** On a real site `emailAddress` may be missing from results, so don't match on it. `400` if `query`, `accountId` and `property` are all missing. | [User search](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-user-search/#api-rest-api-3-user-search-get) |
| `POST /rest/api/3/issue` → `201 {"id","key","self"}` (145) | ✅ | `201 CreatedIssue {id, key, self, transition?, watchers?}` | [Create issue](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-post) |
| Required `fields.project.key`, `fields.issuetype.name`, `fields.summary` (145) | ⚠️ | The fields that can (and must) be set "are determined using Get create issue metadata". A real project can make more fields required. `400` "is missing required fields". | same |
| New issue status `To Do` (145) | ⚠️ | Set by the project workflow's initial status, not by the API. Usually `To Do` on default workflows. | same |
| `GET /rest/api/3/issue/{key}`, `fields=` param (146) | ✅ | `getIssue`, `fields` query param (comma list, `*all`, `-x`). `200 IssueBean {id,key,self,fields,…}`. `404` if not found. | [Get issue](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-get) |
| `POST /rest/api/3/issue/{key}/comment` body ADF → `201` comment (147) | ✅ | `addComment` → `201 Comment`. `body` is "The comment text in Atlassian Document Format". `400` "request is invalid". | [Add comment](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-comments/#api-rest-api-3-issue-issueidorkey-comment-post) |
| `description` must be ADF (151) | ✅ | "`description`, `environment`, and any `textarea` type custom fields … take Atlassian Document Format content." The root needs `type:"doc"`, `version`, `content`. Nodes `paragraph`, `bulletList`, `listItem`, `text`; marks `strong`, `link`. | [Create issue](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-post), [ADF structure](https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/) |
| Plain string → `400` (147, 151) | ⚠️ | ADF is required, but the docs don't say a string gets exactly `400`; they list only generic 400 reasons. The real error body is `ErrorCollection {errorMessages:[], errors:{}}`. | [Jira OpenAPI](https://developer.atlassian.com/cloud/jira/platform/swagger-v3.v3.json) |
| `GET …/transitions` → `{"transitions":[{id,name,to{id,name}}]}` (148) | ✅ | `200 Transitions {expand, transitions[IssueTransition]}`. Real items also carry `hasScreen, isGlobal, isInitial, isAvailable, isConditional, looped`. IDs depend on the workflow (the spec already says so). | [Get transitions](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-transitions-get) |
| `POST …/transitions` `transition.id` → `204` (149) | ✅ | `doTransition` body `IssueUpdateDetails {transition, fields, update, …}` → `204`. `400` "no transition is specified". | [Transition issue](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-transitions-post) |
| No `/rest/api/2/` routes (151) | ✅ | Fine: v3 is the documented version with ADF. | [Jira REST v3 intro](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/) |

### 2.4 Teams Workflows webhook

| Spec item (line) | Verdict | What the real API says | Source |
| --- | --- | --- | --- |
| Path `/teams/hook/{channelId}` (157) | ✅ | The real URL is an opaque trigger callback URL ("displayed to you when you save the flow"), e.g. `https://xxxxx.logic.azure.com:443/…`. The spec treats the whole URL as config (line 15), so the path shape doesn't matter. | [Teams connector – webhook trigger](https://learn.microsoft.com/en-us/connectors/teams/#microsoft-teams-webhook) |
| Body `{"type":"message","attachments":[{"contentType":"application/vnd.microsoft.card.adaptive","content":{…}}]}` (157, 161–181) | ⚠️ | `type` "should always be 'message'". Each attachment has `contentType` (required), **`contentUrl` (marked required, "Value should always be null")** and `content` (required). The spec example omits `contentUrl`. The Teams platform JS sample includes `"contentUrl": null`; the C# sample omits it. | same; [Create incoming webhooks with Workflows](https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook) |
| Also accept MessageCard and plain `{"text":…}` (157) | ✅ | "Workflows support both Adaptive Cards and Message Card format (button rendering won't be supported)." The docs' own request example is `{"text": "Hello from a webhook workflow!"}`. | [add-incoming-webhook](https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook) |
| Response `202`, empty body (157) | ⚠️ | The Teams trigger page doesn't name a status. The Logic Apps Request trigger (which Workflows runs on) says that without a Response action it "immediately returns the **202 ACCEPTED** status". | [Logic Apps Request trigger](https://learn.microsoft.com/en-us/azure/connectors/connectors-native-reqres) |
| "The real webhook always answers `202`" (157) | ⚠️ | Not documented. A token sent to an "Anyone" trigger makes "POST requests to the trigger … fail", so non-202 responses exist. | [Teams connector – webhook trigger](https://learn.microsoft.com/en-us/connectors/teams/#microsoft-teams-webhook) |
| Auth: none, channel in URL (97) | ⚠️ | True only when `triggerAuthenticationType` = "Anyone". For "Any user in my tenant" or "Specific users in my tenant", "you will need to pass an authentication token". | same |
| Adaptive Card `version: "1.5"`, `TextBlock`, `FactSet`, `Action.OpenUrl` (167–178) | ✅ | Teams docs use version 1.5 throughout. Mobile supports up to 1.6. | [Card formatting](https://learn.microsoft.com/en-us/microsoftteams/platform/task-modules-and-cards/cards/cards-format), [Cards reference](https://learn.microsoft.com/en-us/microsoftteams/platform/task-modules-and-cards/cards/cards-reference) |
| `"msteams": { "style": "attention" }` (168) | ❌ | Teams documents only `msteams.width` ("Full") and `msteams.entities` (mentions). `style` is not a documented `msteams` property, so real Teams ignores it. `"style": "attention"` is documented on **Container** (and columns). | [Card formatting](https://learn.microsoft.com/en-us/microsoftteams/platform/task-modules-and-cards/cards/cards-format) |
| Actionable messages (n/a, informational) | ✅ | The trigger "does not support actionable messages", so `Action.Submit`/`Http` won't work. The spec uses only `Action.OpenUrl`, which is fine. | [Teams connector – webhook trigger](https://learn.microsoft.com/en-us/connectors/teams/#microsoft-teams-webhook) |

### 2.5 Admin and helper routes (§4.6, mock-only)

| Spec item (line) | Verdict | What the real API says | Source |
| --- | --- | --- | --- |
| `/admin/*`, `/health`, `/events`, `/ui/*` (186–193) | ✅ | No collision. Real routes live under `/tas/api/*` (TOPdesk), `/v1.0/*` (Graph), `/{tenant}/oauth2/v2.0/token` (Entra, other host), `/rest/api/3/*` (Jira), and an opaque URL (Teams). One caution: the mock's catch-all `POST /{tenantId}/oauth2/v2.0/token` must not capture `/admin/...`. They can't clash today because the suffix differs. | path lists in the sources above |

---

## 3. Suggested spec corrections

Each item gives the line and the change.

1. **Line 90**: change "Accept and ignore unknown fields." to "TOPdesk: reject unknown top-level fields with `400` (as the real API does). Graph and Jira: accept and ignore unknown fields." Otherwise the "be exactly as strict as the real API" rule contradicts itself.
2. **Line 65** (and **line 83** seed): change the change-number format from `C2610-001` to `C 2610 001` (TOPdesk style: `C`, space, 4 digits, space, digits). Update the seed range to `C 2610 001`–`003`.
3. **Line 109**: change "Required body fields: `requester.id`" to "`requester` with one of `id`, `identifier` (UUID/email/name) or `name`". Change "`processingStatus` = `simple_notStarted`" to "`processingStatus` = `rfc` (real tenants create new changes in the rfc or prfc phase)". Alternatively, keep `simple_notStarted` and add a note that this is a demo simplification Bonita must not rely on.
4. **Line 111**: replace the `{"op":"replace","path":"/processingStatus",…}` rule with a new row: `POST /tas/api/operatorChanges/{id}/processingStatusTransitions`, body `{"from":"<current>","action":"start"|"implement"|"close"}` → `201`. Keep JSON Patch for `add /progressTrail` only, and return `400` for any other path. Section 6.1's "In behandeling" and "Afronden" buttons should then call the transitions route.
5. **Line 112**: change "progress trail text" to "`{"memoText":"…","type":"memo"}` (both required; optional `textFormatting`: `plain`|`html`); `{id}` is a UUID".
6. **Lines 108 and 113**: add "`206` + same array (and, for incidents, `x-next-page-url` header) when more results exist than `pageSize` (default 10 for incidents, 50 for persons)". Optionally have the mock return `206` when the seed list exceeds `pageSize`, so the client's handling gets tested.
7. **Line 113**: add "persons query returns archived persons too unless `;archived==false` is in the query".
8. **Line 114**: change "`surName`" to "`surName` (v2, `Accept: application/x.topdesk-person-v2+json`); legacy (no Accept header) also requires `branch`". Then pick which one the mock enforces.
9. **Line 115**: change "(any id; optional)" to "(required unless the tenant has a default archiving reason; mock accepts missing)". Add "already archived → `400`".
10. **Line 104**: change "Required body fields `briefDescription`; `caller` or `callerLookup.email`" to "none required by the OpenAPI. The mock requires `briefDescription` (max 80 chars, else `400`) and one caller form as demo validation." Also note that `callerLookup` accepts `{id}` or `{email}`, exactly one.
11. **Line 123**: change "user (respect `$select`)" to "user. Without `$select`, return only Graph's default set (`businessPhones, displayName, givenName, id, jobTitle, mail, mobilePhone, officeLocation, preferredLanguage, surname, userPrincipalName`). Fields such as `accountEnabled`, `department`, `employeeHireDate`, `usageLocation`, `assignedLicenses` only with `$select`."
12. **Lines 123 and 125**: add "(code observed in practice, not documented; clients must branch on HTTP status, not on `code`/`message`)" after `Request_ResourceNotFound` and after the `already exists` message rule.
13. **Line 95**: add "also accept client credentials in an `Authorization: Basic` header instead of `client_secret`". Add "token errors use Entra's flat shape `{"error":"invalid_request","error_description":"…"}`, not Graph's error object".
14. **Line 135**: change "Every `/v1.0/users/{x}` route accepts either the user `id` or the `userPrincipalName`" to "… except `PUT /users/{id}/manager/$ref`, which is documented with `id` only".
15. **Line 129**: add "user without `usageLocation` → `400`" (real behaviour; Graph says `usageLocation` is "required for users that are assigned licenses"), or note explicitly that the mock doesn't check it.
16. **Line 144**: add "real Jira may omit `emailAddress` (privacy settings); match users on `accountId` after search, not on `emailAddress`".
17. **Line 145**: add "required fields on a real project come from create-issue metadata; the initial status comes from the workflow".
18. **Line 151**: add "Jira error body: `{"errorMessages":[…],"errors":{"field":"msg"}}`".
19. **Line 97**: change "Teams: no auth; the channel is in the URL." to "Teams: no auth, which matches a Workflows trigger set to 'Anyone'. Triggers limited to tenant users need `Authorization: Bearer`, which the mock accepts and ignores."
20. **Line 157**: change "the real webhook always answers `202`" to "the real Workflows trigger answers `202 Accepted` when the flow has no Response action". Add `"contentUrl": null` to the attachment shape in the table and in the example (line 165).
21. **Line 168**: remove `"msteams": { "style": "attention" }`. Wrap the body in `{"type":"Container","style":"attention","items":[…]}` instead. Update §6.4's escalation rule to key off Container `style: attention` or the leading ⚠️ only.
