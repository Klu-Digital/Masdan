import { GenericContainer, Wait } from "testcontainers";
import type { TestProject } from "vite-plus/test/node";

declare module "vite-plus/test" {
  interface ProvidedContext {
    redisUri: string;
  }
}

/**
 * Redis has no `CREATE DATABASE`, so workers share one container and take a
 * numbered logical database each. Raise it in lockstep with the identical
 * constant in `setup/db.ts`.
 */
export const REDIS_TEST_DATABASES = 64;

/**
 * Starts one Redis container per `vp test` invocation. A separate `globalSetup`
 * entry rather than folded into `global-postgres.ts`, so each service tears
 * down independently and a startup failure names the right one.
 */
export default async function setup(
  project: TestProject
): Promise<() => Promise<void>> {
  const container = await new GenericContainer("redis:8-alpine")
    .withExposedPorts(6379)
    .withCommand([
      "redis-server",
      "--databases",
      String(REDIS_TEST_DATABASES),
      "--save",
      "",
    ])
    // "--save ''" disables RDB snapshotting — nothing here needs to survive the
    // run, and it keeps the container off disk entirely.
    .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/u))
    .start();

  // A random free host port, not docker-compose's 6666: this container is
  // unrelated to the local-dev one and does not reuse it.
  project.provide(
    "redisUri",
    `redis://${container.getHost()}:${container.getMappedPort(6379)}`
  );

  return async () => {
    await container.stop();
  };
}
