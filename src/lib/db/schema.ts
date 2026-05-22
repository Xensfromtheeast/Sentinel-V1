import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const events = sqliteTable('events', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	ts: text('ts').notNull(),
	event_type: text('event_type').notNull(),
	payload_json: text('payload_json').notNull(),
	context_json: text('context_json'),
	source_device: text('source_device').notNull(),
	source_event_id: text('source_event_id'),
	related_node_id: integer('related_node_id'),
	rule_id: integer('rule_id'),
	parent_event_id: integer('parent_event_id'),
});
