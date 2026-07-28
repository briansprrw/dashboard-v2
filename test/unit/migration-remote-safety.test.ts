import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { EXPECTED_SCHEMA_VERSION } from '../../src/shared/constants/schema';

// Guards the defect that reached the real preview database on 2026-07-25.
//
// Wrangler's *remote* migration path splits a migration file on `;` and posts
// each fragment to D1's HTTP API separately. A trigger body contains its own
// `;` terminators, so a migration that defines a trigger alongside other
// statements gets cut mid-trigger and fails with
// `incomplete input: SQLITE_ERROR [code: 7500]`.
//
// Nothing else in the suite catches this: `wrangler d1 migrations apply
// --local` and the workerd/Miniflare harness both execute migrations through a
// path that handles trigger bodies correctly, so the broken file applied
// cleanly everywhere except the one place that mattered.
//
// The checks are written as pure functions over SQL text and are exercised
// twice: against deliberately-bad input, so the guard is proven to fail when it
// should, and against the real migration files, so CI catches a bad migration
// before anyone runs a remote apply. A guard only ever tested against
// known-good input is indistinguishable from one that always passes.

const MIGRATIONS_DIR = path.join(import.meta.dirname, '..', '..', 'migrations');

/** Strips `--` line comments so prose about triggers is not mistaken for SQL. */
function stripComments(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

function countTriggers(sql: string): number {
  return (stripComments(sql).match(/\bCREATE\s+TRIGGER\b/gi) ?? []).length;
}

/**
 * Statements outside any trigger body, found by removing whole
 * `CREATE TRIGGER ... END;` blocks and splitting what remains on `;`.
 */
function nonTriggerStatements(sql: string): string[] {
  return stripComments(sql)
    .replace(/\bCREATE\s+TRIGGER\b[\s\S]*?\bEND\s*;/gi, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

/** Schema versions a migration file records, in file order. */
function schemaVersionsRecorded(sql: string): number[] {
  const matches = stripComments(sql).matchAll(
    /INSERT\s+INTO\s+schema_version\s*\([^)]*\)\s*VALUES\s*\(\s*(\d+)/gi
  );
  return [...matches].map((match) => Number(match[1]));
}

/**
 * A migration is remote-safe when it either defines no trigger, or defines only
 * triggers plus — at most — the single `schema_version` insert that records it.
 *
 * This checks *what* the leftover statements are rather than how many there
 * are. An earlier version counted them and allowed one, which let a trigger
 * sitting beside a single `CREATE TABLE` pass: exactly the shape that breaks
 * remotely. Only the schema_version bookkeeping insert is tolerated.
 */
function isRemoteSafe(sql: string): boolean {
  if (countTriggers(sql) === 0) return true;
  return nonTriggerStatements(sql).every((statement) =>
    /^INSERT\s+INTO\s+schema_version\b/i.test(statement)
  );
}

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

function read(file: string): string {
  return readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
}

const TRIGGER_SQL = `
CREATE TRIGGER example_guard
BEFORE INSERT ON widgets
WHEN EXISTS (SELECT 1 FROM widgets WHERE widgets.id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'duplicate');
END;
`;

describe('the remote-safety check itself', () => {
  // Without these, the file below would pass just as happily if the detector
  // were broken and never flagged anything.

  it('rejects a trigger mixed with other statements — the exact shape that failed remotely', () => {
    const bad = `CREATE TABLE widgets (id TEXT PRIMARY KEY);\n${TRIGGER_SQL}`;
    expect(countTriggers(bad)).toBe(1);
    expect(isRemoteSafe(bad)).toBe(false);
  });

  it('rejects a trigger followed by an unrelated statement', () => {
    const bad = `${TRIGGER_SQL}\nCREATE INDEX idx_widgets_id ON widgets (id);\nINSERT INTO schema_version (version, applied_at) VALUES (9, unixepoch());`;
    expect(isRemoteSafe(bad)).toBe(false);
  });

  it('rejects a trigger beside exactly one other statement', () => {
    // The specific hole in the first version of this guard: it counted leftover
    // statements and allowed one, so this shape passed.
    expect(isRemoteSafe(`CREATE INDEX i ON widgets (id);\n${TRIGGER_SQL}`)).toBe(false);
  });

  it('accepts triggers alone, or triggers plus the single schema_version insert', () => {
    expect(isRemoteSafe(TRIGGER_SQL)).toBe(true);
    expect(
      isRemoteSafe(
        `${TRIGGER_SQL}\nINSERT INTO schema_version (version, applied_at) VALUES (9, 1);`
      )
    ).toBe(true);
  });

  it('accepts an ordinary multi-statement migration that defines no trigger', () => {
    const fine = `CREATE TABLE a (id TEXT); CREATE TABLE b (id TEXT); CREATE INDEX i ON a (id);`;
    expect(countTriggers(fine)).toBe(0);
    expect(isRemoteSafe(fine)).toBe(true);
  });

  it('does not mistake the word "trigger" in a comment for a trigger definition', () => {
    const prose = `-- CREATE TRIGGER is deliberately not used here.\nCREATE TABLE a (id TEXT); CREATE TABLE b (id TEXT);`;
    expect(countTriggers(prose)).toBe(0);
    expect(isRemoteSafe(prose)).toBe(true);
  });

  it('reads the schema version out of an insert', () => {
    expect(
      schemaVersionsRecorded('INSERT INTO schema_version (version, applied_at) VALUES (7, 1);')
    ).toEqual([7]);
    expect(schemaVersionsRecorded('CREATE TABLE a (id TEXT);')).toEqual([]);
  });
});

describe('the real migration files are safe for Wrangler remote apply', () => {
  it('finds migration files to check', () => {
    expect(migrationFiles().length).toBeGreaterThan(0);
  });

  it.each(migrationFiles())('%s does not mix a trigger with other statements', (file) => {
    const sql = read(file);
    const triggers = countTriggers(sql);
    if (triggers === 0) return;

    const offending = nonTriggerStatements(sql).filter(
      (statement) => !/^INSERT\s+INTO\s+schema_version\b/i.test(statement)
    );
    expect(
      isRemoteSafe(sql),
      `${file} defines ${triggers} trigger(s) alongside ${offending.length} non-trigger ` +
        `statement(s), starting with: ${offending[0]?.slice(0, 60) ?? '(none)'}. Wrangler's remote ` +
        `path splits on ';' and will cut the trigger body in half ("incomplete input"). Move the ` +
        `triggers into their own migration file.`
    ).toBe(true);
  });

  it('keeps every trigger body syntactically whole', () => {
    for (const file of migrationFiles()) {
      const sql = stripComments(read(file));
      const opens = (sql.match(/\bCREATE\s+TRIGGER\b/gi) ?? []).length;
      const closes = (sql.match(/\bEND\s*;/gi) ?? []).length;
      expect(closes, `${file} has ${opens} CREATE TRIGGER but ${closes} END;`).toBe(opens);
    }
  });
});

describe('recorded schema versions', () => {
  const recorded = migrationFiles().flatMap((file) =>
    schemaVersionsRecorded(read(file)).map((version) => ({ file, version }))
  );

  it('records each schema version exactly once', () => {
    const versions = recorded.map((entry) => entry.version);
    expect(versions).toEqual([...new Set(versions)]);
  });

  it('records a contiguous run starting at 1', () => {
    // A gap would let /api/v1/health compare against a version no migration
    // produces, so a correctly-migrated database would report itself degraded.
    const versions = recorded.map((entry) => entry.version).sort((a, b) => a - b);
    expect(versions).toEqual(versions.map((_, index) => index + 1));
  });

  it('ends at the version the application expects', () => {
    // Pins the migration files to EXPECTED_SCHEMA_VERSION: adding a migration
    // without bumping the constant (or the reverse) fails here rather than as a
    // degraded health response after a deploy.
    const versions = recorded.map((entry) => entry.version);
    expect(Math.max(...versions)).toBe(EXPECTED_SCHEMA_VERSION);
  });

  it('records the final version in the last migration file', () => {
    // The version bump must land in the migration that completes the schema, so
    // a partially-applied run never reports the final version.
    const last = recorded[recorded.length - 1];
    expect(last?.file).toBe(migrationFiles()[migrationFiles().length - 1]);
    expect(last?.version).toBe(EXPECTED_SCHEMA_VERSION);
  });
});
