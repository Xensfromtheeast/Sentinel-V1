import { describe, it, expect } from 'vitest';
import { formatEventLine, buildMarkdownExport, buildJsonExport, type EventRow } from './format.js';

const baseRow: EventRow = {
	id: 1,
	ts: '2026-05-23T08:15:00.000Z',
	event_type: 'craving_logged',
	payload_json: '{"halt":{"hungry":true,"angry":false,"lonely":false,"tired":false}}',
	context_json: null,
	source_device: 'desktop',
	source_event_id: null,
	related_node_id: null,
	rule_id: null,
	parent_event_id: null,
};

describe('formatEventLine', () => {
	it('craving_logged row formats as Markdown bullet with ts, type, payload', () => {
		const line = formatEventLine(baseRow);
		expect(line).toBe(
			'- 2026-05-23T08:15:00.000Z | craving_logged | {"halt":{"hungry":true,"angry":false,"lonely":false,"tired":false}}'
		);
	});

	it('idea_captured row formats correctly', () => {
		const row: EventRow = {
			...baseRow,
			id: 2,
			ts: '2026-05-23T09:00:00.000Z',
			event_type: 'idea_captured',
			payload_json: '{"text":"add export button to header","inbox":true}',
		};
		const line = formatEventLine(row);
		expect(line).toContain('idea_captured');
		expect(line).toContain('add export button to header');
		expect(line).toMatch(/^- 2026-05-23T09:00:00\.000Z \| idea_captured \|/);
	});
});

describe('buildMarkdownExport', () => {
	it('produces header with date and events section', () => {
		const md = buildMarkdownExport('2026-05-23', [baseRow]);
		expect(md).toContain('# Sentinel Export — 2026-05-23');
		expect(md).toContain('## Events');
		expect(md).toContain('craving_logged');
	});

	it('shows placeholder when no events', () => {
		const md = buildMarkdownExport('2026-05-23', []);
		expect(md).toContain('_No events logged yet._');
	});
});

describe('buildJsonExport', () => {
	it('produces valid JSON array with event data', () => {
		const json = buildJsonExport([baseRow]);
		const parsed = JSON.parse(json);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed[0].event_type).toBe('craving_logged');
	});
});
