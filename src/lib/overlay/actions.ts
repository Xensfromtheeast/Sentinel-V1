import { appendEvent } from '$lib/db/index.js';
import type { HaltFlags } from '$lib/types/events.js';
import { notifyCravingSurfed } from '$lib/notifications/index.js';

export async function logCraving(halt: HaltFlags): Promise<number> {
	return appendEvent({
		event_type: 'craving_logged',
		payload: { halt }
	});
}

export async function resolveAsSurfed(startedAt: number): Promise<number> {
	const duration_ms = Date.now() - startedAt;
	const id = await appendEvent({
		event_type: 'craving_resolved',
		payload: { outcome: 'surfed', duration_ms }
	});
	// Fire-and-forget: notification failure must never block the resolve flow
	notifyCravingSurfed(duration_ms).catch(console.error);
	return id;
}

export async function resolveAsSmoked(startedAt: number): Promise<void> {
	await appendEvent({
		event_type: 'craving_resolved',
		payload: { outcome: 'smoked', duration_ms: Date.now() - startedAt }
	});
	await appendEvent({
		event_type: 'cigarette_smoked',
		payload: {}
	});
}
