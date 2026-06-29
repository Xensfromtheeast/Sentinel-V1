export type EventType =
	| 'idea_captured'
	| 'task_created'
	| 'task_completed'
	| 'node_created'
	| 'node_linked'
	| 'tag_added'
	| 'deadline_set'
	| 'halt_checked'
	| 'mood_logged'
	| 'craving_logged'
	| 'craving_resolved'
	| 'cigarette_smoked'
	| 'walk_started'
	| 'walk_completed'
	| 'water_logged'
	| 'breathing_started'
	| 'app_opened'
	| 'app_closed'
	| 'focus_block_started'
	| 'focus_block_ended'
	| 'deep_work_rated'
	| 'review_completed'
	| 'weekly_review_completed'
	| 'mode_changed'
	| 'rule_fired'
	| 'summary_written';

export type HaltFlags = {
	hungry: boolean;
	angry: boolean;
	lonely: boolean;
	tired: boolean;
};

export type EventContext = {
	active_task_id?: number;
	node_id?: number;
	session_id?: string;
};

type PayloadMap = {
	idea_captured: { text: string; inbox: boolean };
	task_created: { title: string; node_id?: number; deadline?: string };
	task_completed: { task_id: number; duration_ms?: number };
	node_created: { label: string; description?: string };
	node_linked: { source_id: number; target_id: number; relation: string };
	tag_added: { entity_id: number; entity_type: 'task' | 'node'; tag: string };
	deadline_set: { entity_id: number; entity_type: 'task' | 'node'; deadline: string };
	halt_checked: { halt: HaltFlags };
	mood_logged: { valence: number; arousal?: number; notes?: string };
	craving_logged: { halt: HaltFlags; intensity?: number; triggers?: string[]; active_task_id?: number };
	craving_resolved: { outcome: 'surfed' | 'smoked'; duration_ms: number };
	cigarette_smoked: { location?: string; notes?: string };
	walk_started: { planned_duration_ms?: number };
	walk_completed: { actual_duration_ms: number; steps?: number };
	water_logged: { amount_ml: number };
	breathing_started: { exercise: string; planned_duration_ms: number };
	app_opened: { version: string };
	app_closed: { session_duration_ms: number };
	focus_block_started: { planned_duration_ms: number; task_id?: number };
	focus_block_ended: { actual_duration_ms: number; interrupted: boolean };
	deep_work_rated: { rating: 1 | 2 | 3 | 4 | 5; notes?: string };
	review_completed: { period: 'daily' | 'weekly'; summary?: string };
	weekly_review_completed: { week_number: number; year: number };
	mode_changed: { from: string; to: string };
	rule_fired: { rule_id: number; trigger: string; action: string };
	summary_written: { period: string; word_count: number };
};

export type AppEvent = {
	[K in EventType]: {
		event_type: K;
		payload: PayloadMap[K];
		context?: EventContext;
		source_device?: 'desktop' | 'phone';
		source_event_id?: string;
		related_node_id?: number;
		rule_id?: number;
		parent_event_id?: number;
	};
}[EventType];
