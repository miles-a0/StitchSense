// Privacy rules for crash reports (docs/CRASH_REPORTING_PLAN.md): no pattern text, chat content,
// emails, tokens, or signed-link query strings. Kept free of Sentry imports so it can be unit tested.

type Data = Record<string, unknown>;

export type ScrubBreadcrumb = {
  category?: string;
  message?: string;
  data?: Data;
  [key: string]: unknown;
};

export type ScrubEvent = {
  request?: { url?: string; query_string?: unknown; data?: unknown; cookies?: unknown; headers?: unknown; [key: string]: unknown };
  user?: { id?: string | number; [key: string]: unknown };
  breadcrumbs?: ScrubBreadcrumb[];
  extra?: Data;
  [key: string]: unknown;
};

// Signed links carry their signature in the query string, and app routes carry titles as params.
export function stripUrlQuery(value: unknown) {
  if (typeof value !== 'string') return value;
  const cut = value.search(/[?#]/);
  return cut === -1 ? value : value.slice(0, cut);
}

const urlKeys = ['url', 'from', 'to'];

export function scrubBreadcrumb<T extends ScrubBreadcrumb>(breadcrumb: T): T | null {
  // Console output can include API payloads and pattern text.
  if (breadcrumb.category === 'console') return null;

  const next: T = { ...breadcrumb };
  if (next.data) {
    const data: Data = { ...next.data };
    for (const key of urlKeys) {
      if (key in data) data[key] = stripUrlQuery(data[key]);
    }
    delete data.params;
    delete data.body;
    delete data.request_body;
    delete data.response_body;
    next.data = data;
  }
  // Touch breadcrumbs name the pressed element, which can include pattern or project titles.
  if (next.category === 'touch') delete next.message;
  if (typeof next.message === 'string' && /^https?:\/\//.test(next.message)) {
    next.message = stripUrlQuery(next.message) as string;
  }
  return next;
}

export function scrubEvent<T extends ScrubEvent>(event: T): T {
  const next: T = { ...event };
  if (next.request) {
    const request = { ...next.request };
    request.url = stripUrlQuery(request.url) as string | undefined;
    delete request.query_string;
    delete request.data;
    delete request.cookies;
    delete request.headers;
    next.request = request;
  }
  if (next.user) {
    // Internal user ID only, for support correlation; never email, name, or IP address.
    next.user = next.user.id !== undefined ? { id: next.user.id } : {};
  }
  if (Array.isArray(next.breadcrumbs)) {
    next.breadcrumbs = next.breadcrumbs
      .map((breadcrumb) => scrubBreadcrumb(breadcrumb))
      .filter((breadcrumb): breadcrumb is ScrubBreadcrumb => breadcrumb !== null);
  }
  return next;
}
