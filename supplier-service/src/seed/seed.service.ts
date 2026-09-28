/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-22
 * Scope: Generated the seed loader following the "Seed data" rules in supplier-service/AGENTS.md
 *        (only when empty, all-or-nothing, Windows-1252 decoding, GitHub link rewrite, null creator).
 * Author review: pending — to be completed by the reviewing team member.
 */
import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { Pool } from 'pg';
import { config } from '../config';
import { PG_POOL } from '../db/database';
import { createLocationSchema, parseOr400 } from '../locations/location.schemas';
import { LocationsService } from '../locations/locations.service';

type CsvRow = Record<
  | 'Name'
  | 'Type'
  | 'Building'
  | 'Floor'
  | 'Location Description'
  | 'Latitude'
  | 'Longitude'
  | 'StartingTime'
  | 'ClosingTime'
  | 'ImageURL',
  string
>;

const GITHUB_BLOB = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/;

/** github.com/<owner>/<repo>/blob/<branch>/<path> -> raw.githubusercontent.com/<owner>/<repo>/<branch>/<path> */
function toImageUrl(value: string): string | null {
  const url = value.trim();
  if (!url) return null;
  const m = GITHUB_BLOB.exec(url);
  return m ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}` : url;
}

function toNumber(value: string): number | string {
  const n = Number(value);
  return value.trim() !== '' && Number.isFinite(n) ? n : value; // leave invalid values for Zod to reject
}

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Seed');

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly locations: LocationsService,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(`Seed aborted, nothing loaded: ${(err as Error).message}`);
    }
  }

  private async seed() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('LOCK TABLE locations IN EXCLUSIVE MODE');
      const { rows } = await client.query<{ n: string }>('SELECT count(*) AS n FROM locations');
      if (Number(rows[0].n) > 0) {
        await client.query('ROLLBACK');
        this.logger.log('Locations already exist; seed skipped.');
        return;
      }

      // The template CSV is Windows-1252, not UTF-8.
      const text = new TextDecoder('windows-1252').decode(readFileSync(config.seedCsvPath));
      const records: CsvRow[] = parse(text, { columns: true, skip_empty_lines: true });

      // Validate every row first (S5.2.1), then insert all of them in one transaction (S5.2.2).
      const inputs = records.map((r, i) =>
        parseOr400(
          createLocationSchema,
          {
            name: r.Name,
            type: r.Type,
            building: r.Building,
            floor: toNumber(r.Floor),
            location_desc: r['Location Description'],
            lat: toNumber(r.Latitude),
            lon: toNumber(r.Longitude),
            open_time: r.StartingTime.trim() || null,
            close_time: r.ClosingTime.trim() || null,
            image_url: toImageUrl(r.ImageURL),
          },
          `seed row ${i + 2}`, // +2: header line, 1-based line numbers
        ),
      );
      for (const input of inputs) {
        await this.locations.create(input, client); // creator stays null (column pending)
      }

      await client.query('COMMIT');
      this.logger.log(`Seeded ${inputs.length} locations from ${config.seedCsvPath}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
