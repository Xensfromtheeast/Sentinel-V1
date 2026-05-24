import { getDb } from './database.js';
import { events } from './schema.js';
import type { AppEvent } from '../types/events.js';

export async function appendEvent(event: AppEvent): Promise<number> {
	const db = await getDb();
	const result = await db
		.insert(events)
		.values({
			ts: new Date().toISOString(),
			event_type: event.event_type,
			payload_json: JSON.stringify(event.payload),
			context_json: event.context ? JSON.stringify(event.context) : null,
			source_device: event.source_device ?? 'desktop',
			source_event_id: event.source_event_id ?? null,
			related_node_id: event.related_node_id ?? null,
			rule_id: event.rule_id ?? null,
			parent_event_id: event.parent_event_id ?? null,
		})
		.returning({ id: events.id });
	return result[0].id;
}
