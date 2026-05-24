/** A raw row as returned by Drizzle from the events table. */
export type EventRow = {
	id: number;
	ts: string;
	event_type: string;
	payload_json: string;
	context_json: string | null;
	source_device: string;
	source_event_id: string | null;
	related_node_id: number | null;
	rule_id: number | null;
	parent_event_id: number | null;
};

/**
 * Format one event row as a Markdown bullet line.
 * Example: `- 2026-05-23T08:15:00Z | craving_logged | {"halt":{"hungry":true}}`
 */
export function formatEventLine(row: EventRow): string {
	return `- ${row.ts} | ${row.event_type} | ${row.payload_json}`;
}

/** Build a full Markdown export document from an array of event rows. */
export function buildMarkdownExport(date: string, rows: EventRow[]): string {
	const lines = rows.map(formatEventLine).join('\n');
	return `# Sentinel Export — ${date}\n\n## Events\n\n${lines || '_No events logged yet._'}\n`;
}

/** Build a JSON export string (pretty-printed array of raw rows). */
export function buildJsonExport(rows: EventRow[]): string {
	return JSON.stringify(rows, null, 2);
}
