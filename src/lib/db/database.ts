import { drizzle } from 'drizzle-orm/sqlite-proxy';
import Database from '@tauri-apps/plugin-sql';
import { homeDir, join } from '@tauri-apps/api/path';

let _db: ReturnType<typeof drizzle> | null = null;

/**
 * Resolve ~/Sentinel/events.db at runtime via HOME / USERPROFILE, matching the
 * Rust side (sentinel_base() in src-tauri/src/lib.rs). The sqlite: URL uses
 * forward slashes on every platform so it works on Windows too.
 */
async function resolveDbUrl(): Promise<string> {
	const path = await join(await homeDir(), 'Sentinel', 'events.db');
	return 'sqlite:' + path.replace(/\\/g, '/');
}

export async function getDb(): Promise<ReturnType<typeof drizzle>> {
	if (_db) return _db;
	const conn = await Database.load(await resolveDbUrl());
	_db = drizzle(async (sql, params, method) => {
		if (method === 'run') {
			await conn.execute(sql, params as unknown[]);
			return { rows: [] };
		}
		const rows = await conn.select<Record<string, unknown>[]>(sql, params as unknown[]);
		return { rows: rows.map((r: Record<string, unknown>) => Object.values(r)) };
	});
	return _db;
}
