import IORedis from "ioredis";

// Shared between the Next.js app (producer side, enqueuing jobs) and the
// worker process (consumer side, processing them) — both need a Redis
// connection built the same way. maxRetriesPerRequest: null is a BullMQ
// requirement for connections used by a Worker (blocking commands need
// unlimited retries), harmless for the producer side too.
let connection: IORedis | undefined;

export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
  }
  return connection;
}
