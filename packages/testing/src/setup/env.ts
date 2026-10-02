// No REDIS_URL placeholder: a dead port causes an ECONNREFUSED retry storm.
process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??=
  "postgresql://postgres:password@127.0.0.1:1/unused";
process.env.BETTER_AUTH_SECRET ??= "test-secret-at-least-32-characters!!";
process.env.BETTER_AUTH_URL ??= "http://localhost:1900";
process.env.CORS_ORIGIN ??= "http://localhost:2600";
