import { appendEvent } from '$lib/db/index.js';
import type { HaltFlags } from '$lib/types/events.js';
import { notifyCravingSurfed } from '$lib/notifications/index.js';

export async function logCraving(
	halt: HaltFlags,
	intensity?: number,
	triggers?: string[]
): Promise<number> {
	return appendEvent({
		event_type: 'craving_logged',
		payload: {
			halt,
			...(intensity !== undefined ? { intensity } : {}),
			...(triggers && triggers.length ? { triggers } : {})
		}
	});
}

export async function resolveAsSurfed(startedAt: number, parentId?: number): Promise<number> {
	const duration_ms = Date.now() - startedAt;
	const id = await appendEvent({
		event_type: 'craving_resolved',
		payload: { outcome: 'surfed', duration_ms },
		...(parentId !== undefined ? { parent_event_id: parentId } : {})
	});
	// Fire-and-forget: notification failure must never block the resolve flow
	notifyCravingSurfed(duration_ms).catch(console.error);
	return id;
}

export async function resolveAsSmoked(startedAt: number, parentId?: number): Promise<void> {
	await appendEvent({
		event_type: 'craving_resolved',
		payload: { outcome: 'smoked', duration_ms: Date.now() - startedAt },
		...(parentId !== undefined ? { parent_event_id: parentId } : {})
	});
	await appendEvent({
		event_type: 'cigarette_smoked',
		payload: {}
	});
}
