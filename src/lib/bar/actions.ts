import { appendEvent } from '$lib/db/index.js';

export type BarMode = 'idle' | 'craving' | 'task' | 'idea' | 'focus' | 'freetext';

type ImmediateResult = { mode: 'craving' | 'task'; immediate: true; placeholder: '' };
type DeferredResult = { mode: 'idea' | 'focus' | 'freetext'; immediate: false; placeholder: string };
export type ClassifyResult = ImmediateResult | DeferredResult;

export function classifyFirstKey(key: string): ClassifyResult {
	switch (key) {
		case 'c':
			return { mode: 'craving', immediate: true, placeholder: '' };
		case 't':
			return { mode: 'task', immediate: true, placeholder: '' };
		case 'i':
			return { mode: 'idea', immediate: false, placeholder: "What's the idea?" };
		case 'f':
			return { mode: 'focus', immediate: false, placeholder: 'Focus on what?' };
		default:
			return { mode: 'freetext', immediate: false, placeholder: 'Capture anything…' };
	}
}

export async function dispatchBarInput(
	mode: Exclude<BarMode, 'idle'>,
	text: string
): Promise<number> {
	switch (mode) {
		case 'task':
			// placeholder task_id 0 — task management is feat/03+
			return appendEvent({
				event_type: 'task_completed',
				payload: { task_id: 0 }
			});
		case 'focus':
			return appendEvent({
				event_type: 'focus_block_started',
				payload: { planned_duration_ms: 25 * 60 * 1000 }
			});
		case 'idea':
		case 'freetext':
		default:
			return appendEvent({
				event_type: 'idea_captured',
				payload: { text: text.trim(), inbox: true }
			});
	}
}
