import { invoke } from '@tauri-apps/api/core';
import { appendEvent } from '$lib/db/index.js';

export function localDate(): string {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function readDailyNote(date: string): Promise<string> {
	return invoke<string>('read_daily_note', { date });
}

export async function writeDailyNote(date: string, content: string): Promise<void> {
	await invoke<void>('write_daily_note', { date, content });
}

export async function saveNote(date: string, content: string): Promise<void> {
	await writeDailyNote(date, content);
	const word_count = content.split(/\s+/).filter(Boolean).length;
	await appendEvent({
		event_type: 'summary_written',
		payload: { period: date, word_count }
	});
}
