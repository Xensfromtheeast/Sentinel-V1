import { drizzle } from 'drizzle-orm/sqlite-proxy';
import Database from '@tauri-apps/plugin-sql';

const DB_URL = 'sqlite:/home/adminxens/Sentinel/events.db';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb(): Promise<ReturnType<typeof drizzle>> {
	if (_db) return _db;
	const conn = await Database.load(DB_URL);
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
