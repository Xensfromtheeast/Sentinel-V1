import { appendEvent } from '$lib/db/index.js';

/**
 * A thought is just a node_created event; its identity is the event's row id.
 * Returns that id so the caller can link to it.
 */
export async function createNode(label: string, description?: string): Promise<number> {
	return appendEvent({
		event_type: 'node_created',
		payload: {
			label: label.trim(),
			...(description && description.trim() ? { description: description.trim() } : {})
		}
	});
}

export async function linkNodes(
	sourceId: number,
	targetId: number,
	relation = 'links'
): Promise<number> {
	return appendEvent({
		event_type: 'node_linked',
		payload: { source_id: sourceId, target_id: targetId, relation }
	});
}
