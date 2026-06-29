import { desc } from 'drizzle-orm';
import { getDb } from './database.js';
import { events } from './schema.js';
import type { EventType, HaltFlags } from '../types/events.js';

export type StoredEvent = {
	id: number;
	ts: string;
	eventType: EventType | string;
	payload: Record<string, unknown>;
	parentEventId: number | null;
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
		payload: parsePayload(r.payload_json),
		parentEventId: r.parent_event_id ?? null
	}));
}

// ----- cravings -----

export type CravingRecord = {
	id: number;
	ts: string;
	outcome: 'surfed' | 'smoked';
	halt: HaltFlags | null;
	intensity: number | null;
	triggers: string[];
};

function asHalt(value: unknown): HaltFlags | null {
	if (!value || typeof value !== 'object') return null;
	const v = value as Record<string, unknown>;
	return {
		hungry: !!v.hungry,
		angry: !!v.angry,
		lonely: !!v.lonely,
		tired: !!v.tired
	};
}

/**
 * Resolved cravings within the last `days`, newest first, joined to the
 * craving_logged event they came from (via parent_event_id, falling back to the
 * most recent preceding craving_logged for events written before linking).
 */
export async function readCravings(days = 7): Promise<CravingRecord[]> {
	const recent = await readRecentEvents(1000);
	const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

	const logged = recent.filter((e) => e.eventType === 'craving_logged');
	const byId = new Map(logged.map((e) => [e.id, e]));
	// Ascending by ts for the fallback lookup.
	const loggedAsc = [...logged].sort((a, b) => a.ts.localeCompare(b.ts));

	const findLogged = (resolvedTs: string, parentId: number | null): StoredEvent | undefined => {
		if (parentId !== null && byId.has(parentId)) return byId.get(parentId);
		let match: StoredEvent | undefined;
		for (const l of loggedAsc) {
			if (l.ts <= resolvedTs) match = l;
			else break;
		}
		return match;
	};

	return recent
		.filter((e) => e.eventType === 'craving_resolved' && new Date(e.ts).getTime() >= cutoff)
		.map((e) => {
			const src = findLogged(e.ts, e.parentEventId);
			const intensity = src && typeof src.payload.intensity === 'number' ? src.payload.intensity : null;
			const triggers =
				src && Array.isArray(src.payload.triggers)
					? (src.payload.triggers as unknown[]).filter((t): t is string => typeof t === 'string')
					: [];
			return {
				id: e.id,
				ts: e.ts,
				outcome: e.payload.outcome === 'smoked' ? 'smoked' : 'surfed',
				halt: src ? asHalt(src.payload.halt) : null,
				intensity,
				triggers
			};
		});
}

// ----- mind tree -----

export type GraphNode = { id: number; label: string; description: string };
export type MindGraph = { nodes: GraphNode[]; edges: [number, number][] };

export async function readMindGraph(): Promise<MindGraph> {
	const recent = await readRecentEvents(1000);

	const nodes: GraphNode[] = recent
		.filter((e) => e.eventType === 'node_created')
		.map((e) => ({
			id: e.id,
			label: typeof e.payload.label === 'string' ? e.payload.label : 'Untitled',
			description: typeof e.payload.description === 'string' ? e.payload.description : ''
		}));
	const nodeIds = new Set(nodes.map((n) => n.id));

	const seen = new Set<string>();
	const edges: [number, number][] = [];
	for (const e of recent) {
		if (e.eventType !== 'node_linked') continue;
		const a = Number(e.payload.source_id);
		const b = Number(e.payload.target_id);
		if (!nodeIds.has(a) || !nodeIds.has(b) || a === b) continue;
		const key = a < b ? `${a}-${b}` : `${b}-${a}`;
		if (seen.has(key)) continue;
		seen.add(key);
		edges.push([a, b]);
	}

	// Oldest first reads more naturally as a "first thought → branches" graph.
	nodes.reverse();
	return { nodes, edges };
}
