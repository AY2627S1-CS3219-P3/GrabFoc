/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Generated these startup tests, using the isolateModules approach in
 *        supplier-service/src/config.spec.ts.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Added the database-URL cases after the PR #129 review.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-23
 * Scope: Added the unrepresentable-interval cases (PR #129 review).
 * Author review: Cole Lin, read and approved.
 */

/** Evaluates src/config.ts afresh with the given environment; returns the error message, or 'ok'. */
function loadConfig(env: Record<string, string>): string {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try {
    jest.isolateModules(() => {
      require('./config');
    });
    return 'ok';
  } catch (err) {
    return (err as Error).message;
  } finally {
    process.env = saved;
  }
}

// '' rather than unset, so a developer's own .env cannot fill these in (see test/env.setup.ts).
const base = {
  LOGGING_DATABASE_URL: 'postgres://user:pass@localhost:5432/logging',
  LOGGING_JWKS_URL: 'http://localhost:3001/.well-known/jwks.json',
  LOGGING_KAFKA_BROKERS: '',
  LOGGING_RETENTION_DAYS: '',
  LOGGING_PURGE_INTERVAL_MINUTES: '',
};

it('starts with just a database and a JWKS url', () => {
  expect(loadConfig(base)).toBe('ok');
});

/**
 * There is no dev-auth mode here, so the JWKS url is never optional: without it the service
 * refuses to start rather than running with no way to verify a token.
 */

// AI-generated (reviewed by Cole Lin).
it.each(['LOGGING_DATABASE_URL', 'LOGGING_JWKS_URL'])('refuses to start without %s', (name) => {
  expect(loadConfig({ ...base, [name]: '' })).toContain(`Missing environment variable ${name}`);
});

// compose interpolates the password into this URL and cannot percent-encode it (PR #129 review).
// A `#` truncates the authority, so the URL is no longer the one anyone intended.
it('refuses a database URL that does not parse', () => {
  expect(loadConfig({ ...base, LOGGING_DATABASE_URL: 'postgres://foc:pa#ss@localhost:5436/logging' }))
    .toContain('percent-encode');
});

// A scheme-less JWKS url passed a non-empty check and then every auth attempt looked like a
// transient 503 forever, instead of the service refusing to start (PR #129 review).
it.each(['localhost:3001/.well-known/jwks.json', 'not a url', 'ftp://host/keys'])(
  'refuses the JWKS url %s',
  (url) => {
    expect(loadConfig({ ...base, LOGGING_JWKS_URL: url })).toContain('LOGGING_JWKS_URL must be');
  },
);

it('refuses a database URL that is not postgres', () => {
  expect(loadConfig({ ...base, LOGGING_DATABASE_URL: 'mysql://foc:pass@localhost:3306/logging' }))
    .toContain('must be a postgres:// URL');
});

it.each([
  ['LOGGING_RETENTION_DAYS', '0'],
  ['LOGGING_RETENTION_DAYS', '-1'],
  ['LOGGING_RETENTION_DAYS', 'thirty'],
  ['LOGGING_PURGE_INTERVAL_MINUTES', '1.5'],
])('refuses %s=%s rather than silently using the default', (name, value) => {
  expect(loadConfig({ ...base, [name]: value })).toContain(`${name} must be a whole number`);
});

/**
 * Number.isInteger(1e20) is true, and a retention of 1e20 days makes the purge fail on every run
 * while runOnce catches it and the service looks healthy - so nothing is deleted and nobody finds
 * out (PR #129 review).
 */
it.each([
  ['LOGGING_RETENTION_DAYS', '1e20'],
  ['LOGGING_RETENTION_DAYS', '3651'],
  ['LOGGING_PURGE_INTERVAL_MINUTES', '1e20'],
])('refuses %s=%s, which no interval can express', (name, value) => {
  expect(loadConfig({ ...base, [name]: value })).toContain(`${name} must be a whole number between`);
});

it('still accepts the longest retention it allows', () => {
  expect(loadConfig({ ...base, LOGGING_RETENTION_DAYS: '3650' })).toBe('ok');
});

it('defaults retention to 30 days and the topic to logging.lines', () => {
  Object.assign(process.env, base);
  let loaded: typeof import('./config').config | undefined;
  jest.isolateModules(() => {
    loaded = (require('./config') as typeof import('./config')).config;
  });
  expect(loaded).toMatchObject({ retentionDays: 30, kafkaTopic: 'logging.lines', port: 3006 });
  expect(loaded!.kafkaBrokers).toEqual([]);
});

it('splits a broker list and ignores stray whitespace', () => {
  Object.assign(process.env, { ...base, LOGGING_KAFKA_BROKERS: 'kafka:9092, kafka-2:9092 ,' });
  let loaded: typeof import('./config').config | undefined;
  jest.isolateModules(() => {
    loaded = (require('./config') as typeof import('./config')).config;
  });
  expect(loaded!.kafkaBrokers).toEqual(['kafka:9092', 'kafka-2:9092']);
});
