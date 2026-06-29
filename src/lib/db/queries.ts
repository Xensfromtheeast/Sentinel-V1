import { desc } from 'drizzle-orm';
import { getDb } from './database.js';
import { events } from './schema.js';
import type { EventType } from '../types/events.js';

export type StoredEvent = {
	id: number;
	ts: string;
	eventType: EventType | string;
	payload: Record<string, unknown>;
};

function parsePayload(raw: unknown): Record<string, unknown> {
	if (typeof raw !== 'string') return {};
	try {
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

/** Most recent events first. Read-only; the only write path remains appendEvent. */
export async function readRecentEvents(limit = 200): Promise<StoredEvent[]> {
	const db = await getDb();
	const rows = await db.select().from(events).orderBy(desc(events.ts)).limit(limit);
	return rows.map((r) => ({
		id: r.id,
		ts: r.ts,
		eventType: r.event_type,
		payload: parsePayload(r.payload_json)
	}));
}
