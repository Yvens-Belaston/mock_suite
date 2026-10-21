/** A stored Jira issue as returned by `/admin/state`.jira.issues (spec section 3). */
export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    project: { key: string };
    issuetype: { name: string };
    summary: string;
    description: unknown;
    assignee: { accountId: string } | null;
    labels: string[];
    duedate: string | null;
    status: { name: string };
  };
  comments: unknown[];
  /** Callback B result, set once a `case-*` issue reached Done. */
  bonitaCallback?: { status: 'ok' | 'error'; httpStatus: number | null; at: string };
  createdAt: string;
  updatedAt: string;
}
