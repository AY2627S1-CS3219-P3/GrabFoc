/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated the PostgreSQL pool provider, startup migration hook and the
 *        transaction helper.
 * Author review: Read in full; verified the service starts, migrates and serves /health under docker compose.
 */
import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { config } from '../config';
import { runMigrations } from './migrator';

export const PG_POOL = Symbol('PG_POOL');

/**
 * Runs a callback inside one transaction on a single checked-out client, and always returns
 * the client to the pool. Use this for anything that reads and writes together — notably the
 * last-admin lock (`SELECT … FOR UPDATE`), which is only safe on one client.
 *
 * Leaking a client by forgetting `release()` will exhaust the pool and hang the service, which
 * is why nothing should call `pool.connect()` directly.
 */
export async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

@Injectable()
export class DatabaseLifecycle implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Database');

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleInit() {
    await runMigrations(this.pool);
    this.logger.log('Database ready');
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [
    { provide: PG_POOL, useFactory: () => new Pool({ connectionString: config.databaseUrl }) },
    DatabaseLifecycle,
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
