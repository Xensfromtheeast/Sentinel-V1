import { invoke } from '@tauri-apps/api/core';
import { asc, like } from 'drizzle-orm';
import { getDb } from '$lib/db/database.js';
import { events } from '$lib/db/schema.js';
import { buildMarkdownExport, buildJsonExport, type EventRow } from './format.js';
import { localDate } from '$lib/note/index.js';

export type ExportResult = {
	md_path: string;
	json_path: string;
	event_count: number;
};

/**
 * Query all events, format as Markdown + JSON, write via Rust write_export command.
 * Returns the paths to the two written files and the event count.
 */
export async function exportAll(): Promise<ExportResult> {
	const db = await getDb();
	const date = localDate();
	const rows = await db.select().from(events)
		.where(like(events.ts, `${date}%`))
		.orderBy(asc(events.ts)) as EventRow[];
	const mdContent = buildMarkdownExport(date, rows);
	const jsonContent = buildJsonExport(rows);

	const result = await invoke<{ md_path: string; json_path: string }>('write_export', {
		date,
		mdContent,
		jsonContent
	});

	return { ...result, event_count: rows.length };
}
