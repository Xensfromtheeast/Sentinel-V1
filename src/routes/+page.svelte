<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, keymap } from '@codemirror/view';
	import { EditorState } from '@codemirror/state';
	import { basicSetup } from 'codemirror';
	import { markdown } from '@codemirror/lang-markdown';
	import { readDailyNote, writeDailyNote, saveNote, localDate } from '$lib/note/index.js';
	import { exportAll } from '$lib/export/index.js';
	import { logCraving, resolveAsSurfed, resolveAsSmoked } from '$lib/overlay/actions.js';
	import { createNode, linkNodes } from '$lib/mind/actions.js';
	import {
		readRecentEvents,
		readCravings,
		readMindGraph,
		type StoredEvent,
		type CravingRecord,
		type GraphNode,
		type MindGraph
	} from '$lib/db/queries.js';
	import { theme, toggleTheme } from '$lib/stores/theme.js';
	import type { HaltFlags } from '$lib/types/events.js';

	type View = 'today' | 'cravings' | 'mind';

	const date = localDate();

	// ----- navigation / theme -----
	let view = $state<View>('today');

	// ----- export -----
	let exportStatus = $state<'idle' | 'exporting' | 'done' | 'error'>('idle');
	let resetTimer: ReturnType<typeof setTimeout> | undefined;
	async function handleExport() {
		if (exportStatus === 'exporting') return;
		exportStatus = 'exporting';
		try {
			await exportAll();
			exportStatus = 'done';
		} catch (e) {
			console.error('export failed:', e);
			exportStatus = 'error';
		}
		clearTimeout(resetTimer);
		resetTimer = setTimeout(() => (exportStatus = 'idle'), 2500);
	}

	// ----- daily note (CodeMirror) -----
	const editorTheme = EditorView.theme({
		'&': { backgroundColor: 'transparent', color: 'var(--text)', height: '100%' },
		'&.cm-focused': { outline: 'none' },
		'.cm-scroller': {
			fontFamily: 'var(--font-sans)',
			fontSize: '15px',
			lineHeight: '1.7'
		},
		'.cm-content': { padding: '20px', caretColor: 'var(--accent)' },
		'.cm-cursor': { borderLeftColor: 'var(--accent)' },
		'.cm-gutters': { display: 'none' },
		'.cm-activeLine': { backgroundColor: 'transparent' },
		'.cm-selectionBackground': { backgroundColor: 'var(--accent-soft) !important' },
		'&.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--accent-soft) !important' }
	});

	function noteEditor(node: HTMLElement) {
		let editor: EditorView | undefined;
		let destroyed = false;
		let debounce: ReturnType<typeof setTimeout> | undefined;

		const save = () => {
			const content = editor?.state.doc.toString() ?? '';
			saveNote(date, content).catch(console.error);
			return true;
		};

		readDailyNote(date)
			.then((content) => {
				if (destroyed) return;
				editor = new EditorView({
					state: EditorState.create({
						doc: content,
						extensions: [
							basicSetup,
							markdown(),
							EditorView.lineWrapping,
							editorTheme,
							keymap.of([{ key: 'Mod-s', run: save }]),
							EditorView.updateListener.of((u) => {
								if (!u.docChanged) return;
								clearTimeout(debounce);
								debounce = setTimeout(() => {
									writeDailyNote(date, u.state.doc.toString()).catch(console.error);
								}, 1000);
							})
						]
					}),
					parent: node
				});
			})
			.catch(console.error);

		return {
			destroy() {
				destroyed = true;
				clearTimeout(debounce);
				if (editor) {
					writeDailyNote(date, editor.state.doc.toString()).catch(console.error);
					editor.destroy();
				}
			}
		};
	}

	// ----- craving overlay (in-window, 4 steps) -----
	let cravingOpen = $state(false);
	let step = $state(0);
	let halt = $state({ H: false, A: false, L: false, T: false });
	let intensity = $state(5);
	let trig = $state<Record<string, boolean>>({});
	let surf = $state(60);
	let outcome = $state<'surfed' | 'smoked' | null>(null);
	let startedAt = 0;
	let surfTimer: ReturnType<typeof setInterval> | undefined;

	const HALT_LABEL: Record<string, string> = { H: 'Hungry', A: 'Angry', L: 'Lonely', T: 'Tired' };
	const TRIGGERS: [string, string][] = [
		['boredom', 'Boredom'],
		['stress', 'Stress'],
		['habit', 'Habit'],
		['social', 'Social'],
		['reward', 'Reward'],
		['meal', 'After meal']
	];

	const haltFlags: HaltFlags = $derived({
		hungry: halt.H,
		angry: halt.A,
		lonely: halt.L,
		tired: halt.T
	});
	const haltSummary = $derived(
		(['H', 'A', 'L', 'T'] as const).filter((k) => halt[k]).map((k) => HALT_LABEL[k]).join(' · ') ||
			'No flags'
	);
	const intensityLabel = $derived(
		intensity <= 3 ? 'mild' : intensity <= 5 ? 'building' : intensity <= 7 ? 'strong' : intensity <= 9 ? 'intense' : 'peak'
	);
	const rangePct = $derived(((intensity - 1) / 9) * 100);
	const stepName = $derived(['HALT CHECK', 'LOG', 'SURF', 'LOGGED'][step]);
	const surfText = $derived('0:' + String(surf).padStart(2, '0'));
	const outSurfed = $derived(outcome === 'surfed');

	function stopSurf() {
		if (surfTimer) {
			clearInterval(surfTimer);
			surfTimer = undefined;
		}
	}

	function openCraving() {
		stopSurf();
		step = 0;
		halt = { H: false, A: false, L: false, T: false };
		intensity = 5;
		trig = {};
		surf = 60;
		outcome = null;
		cravingOpen = true;
	}
	function closeCraving() {
		stopSurf();
		cravingOpen = false;
	}
	function doneCraving() {
		cravingOpen = false;
		view = 'today';
	}

	function next() {
		step = 1;
	}
	function back() {
		step = Math.max(0, step - 1);
	}

	let loggedId: number | undefined;

	async function startSurf() {
		stopSurf();
		step = 2;
		surf = 60;
		startedAt = Date.now();
		loggedId = undefined;
		const triggers = TRIGGERS.filter(([k]) => trig[k]).map(([, l]) => l);
		// Persist the craving the moment surfing begins (real append-only event).
		try {
			loggedId = await logCraving(haltFlags, intensity, triggers);
		} catch (err) {
			console.error('failed to log craving:', err);
		}
		surfTimer = setInterval(() => {
			surf = Math.max(0, surf - 1);
			if (surf <= 0) finish('surfed');
		}, 1000);
	}
	async function finish(result: 'surfed' | 'smoked') {
		stopSurf();
		outcome = result;
		step = 3;
		try {
			// Link the resolution back to the logged craving via parent_event_id.
			if (result === 'surfed') await resolveAsSurfed(startedAt, loggedId);
			else await resolveAsSmoked(startedAt, loggedId);
		} catch (err) {
			console.error('failed to resolve craving:', err);
		}
		// Reflect the just-written craving in the timeline and cravings view.
		loadEvents();
		loadCravings();
	}

	// ----- Today timeline (real DB reads) -----
	type EventRow = { time: string; label: string; detail: string; kind: string };
	let events = $state<EventRow[]>([]);
	let eventsLoading = $state(true);
	let eventsError = $state(false);
	let surfedToday = $state(0);

	const HALT_NAMES: Record<string, string> = {
		hungry: 'Hungry',
		angry: 'Angry',
		lonely: 'Lonely',
		tired: 'Tired'
	};

	function fmtTime(ts: string): string {
		const d = new Date(ts);
		if (Number.isNaN(d.getTime())) return '';
		return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
	}
	function tsLocalDate(ts: string): string {
		const d = new Date(ts);
		if (Number.isNaN(d.getTime())) return '';
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}
	function haltText(payload: Record<string, unknown>): string {
		const halt = (payload.halt ?? {}) as Record<string, unknown>;
		const flags = Object.keys(HALT_NAMES).filter((k) => halt[k]).map((k) => HALT_NAMES[k]);
		return flags.length ? 'Flagged: ' + flags.join(' · ') : 'No flags';
	}
	function describe(ev: StoredEvent): { label: string; detail: string; kind: string } {
		const p = ev.payload;
		switch (ev.eventType) {
			case 'craving_logged':
				return { label: 'Craving · logged', detail: haltText(p), kind: 'craving' };
			case 'craving_resolved': {
				const surfed = p.outcome === 'surfed';
				const secs = typeof p.duration_ms === 'number' ? Math.round(p.duration_ms / 1000) : 0;
				return {
					label: surfed ? 'Craving · surfed' : 'Craving · gave in',
					detail: `${surfed ? 'surfed' : 'gave in'} · ${secs}s`,
					kind: surfed ? 'surfed' : 'smoked'
				};
			}
			case 'halt_checked':
				return { label: 'HALT check', detail: haltText(p), kind: 'halt' };
			case 'cigarette_smoked':
				return { label: 'Cigarette', detail: 'logged', kind: 'smoked' };
			case 'summary_written':
				return {
					label: 'Daily note saved',
					detail: typeof p.word_count === 'number' ? `${p.word_count} words` : '',
					kind: 'note'
				};
			case 'idea_captured':
				return { label: 'Idea captured', detail: typeof p.text === 'string' ? p.text : '', kind: 'idea' };
			case 'focus_block_started':
				return { label: 'Focus block', detail: 'started', kind: 'focus' };
			case 'focus_block_ended':
				return { label: 'Focus block', detail: 'ended', kind: 'focus' };
			case 'task_completed':
				return { label: 'Task completed', detail: '', kind: 'task' };
			case 'app_opened':
				return { label: 'App opened', detail: '', kind: 'note' };
			default:
				return { label: String(ev.eventType).replace(/_/g, ' '), detail: '', kind: 'other' };
		}
	}

	async function loadEvents() {
		eventsLoading = true;
		eventsError = false;
		try {
			const today = localDate();
			const recent = await readRecentEvents(200);
			const todays = recent.filter((e) => tsLocalDate(e.ts) === today);
			events = todays.map((e) => ({ time: fmtTime(e.ts), ...describe(e) }));
			surfedToday = todays.filter(
				(e) => e.eventType === 'craving_resolved' && e.payload.outcome === 'surfed'
			).length;
		} catch (err) {
			console.error('failed to load events:', err);
			eventsError = true;
			events = [];
		} finally {
			eventsLoading = false;
		}
	}

	function eventDot(kind: string): string {
		if (kind === 'surfed') return 'var(--accent)';
		if (kind === 'craving' || kind === 'smoked') return 'var(--warm)';
		if (kind === 'halt') return 'var(--accent-text)';
		return 'var(--faint)';
	}

	// ----- Cravings (real DB reads) -----
	let cravings = $state<CravingRecord[]>([]);
	let cravingsLoading = $state(true);
	let cravingsError = $state(false);

	async function loadCravings() {
		cravingsLoading = true;
		cravingsError = false;
		try {
			cravings = await readCravings(7);
		} catch (err) {
			console.error('failed to load cravings:', err);
			cravingsError = true;
			cravings = [];
		} finally {
			cravingsLoading = false;
		}
	}

	function relWhen(ts: string): string {
		const d = new Date(ts);
		if (Number.isNaN(d.getTime())) return '';
		const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
		const day = tsLocalDate(ts);
		const today = localDate();
		const yesterday = tsLocalDate(new Date(Date.now() - 86400000).toISOString());
		if (day === today) return `Today · ${hhmm}`;
		if (day === yesterday) return `Yesterday · ${hhmm}`;
		return `${d.toLocaleDateString(undefined, { weekday: 'short' })} · ${hhmm}`;
	}
	function haltLabel(halt: HaltFlags | null): string {
		if (!halt) return '—';
		const names = Object.keys(HALT_NAMES).filter((k) => (halt as Record<string, boolean>)[k]).map((k) => HALT_NAMES[k]);
		return names.length ? names.join(' · ') : '—';
	}

	type HistoryRow = { when: string; out: 'surfed' | 'smoked'; halt: string; intensity: number | null; trig: string };
	const historyRows = $derived<HistoryRow[]>(
		cravings.map((c) => ({
			when: relWhen(c.ts),
			out: c.outcome,
			halt: haltLabel(c.halt),
			intensity: c.intensity,
			trig: c.triggers.length ? c.triggers.join(', ') : 'Unspecified'
		}))
	);

	const surfedCount = $derived(cravings.filter((c) => c.outcome === 'surfed').length);
	const surfRate = $derived(cravings.length ? Math.round((surfedCount / cravings.length) * 100) : 0);
	const intensityValues = $derived(
		cravings.map((c) => c.intensity).filter((i): i is number => typeof i === 'number')
	);
	const avgIntensity = $derived(
		intensityValues.length
			? (intensityValues.reduce((a, b) => a + b, 0) / intensityValues.length).toFixed(1)
			: '—'
	);

	// ----- Mind tree (real DB reads + creation) -----
	let graph = $state<MindGraph>({ nodes: [], edges: [] });
	let graphLoading = $state(true);
	let graphError = $state(false);
	let selNode = $state<number | null>(null);

	// inline "link a thought" creation
	let linking = $state(false);
	let newLabel = $state('');
	let creating = $state(false);

	async function loadGraph() {
		graphLoading = true;
		graphError = false;
		try {
			graph = await readMindGraph();
			if (selNode === null || !graph.nodes.some((n) => n.id === selNode)) {
				selNode = graph.nodes.length ? graph.nodes[0].id : null;
			}
		} catch (err) {
			console.error('failed to load mind graph:', err);
			graphError = true;
			graph = { nodes: [], edges: [] };
		} finally {
			graphLoading = false;
		}
	}

	type PlacedNode = GraphNode & { x: number; y: number; big: boolean };
	// Positions are derived from graph shape (not persisted): most-connected node
	// in the centre, the rest evenly on a ring around it.
	const layout = $derived.by<PlacedNode[]>(() => {
		const { nodes, edges } = graph;
		if (!nodes.length) return [];
		const deg = new Map<number, number>(nodes.map((n) => [n.id, 0]));
		for (const [a, b] of edges) {
			deg.set(a, (deg.get(a) ?? 0) + 1);
			deg.set(b, (deg.get(b) ?? 0) + 1);
		}
		const center = [...nodes].sort((a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0))[0];
		const others = nodes.filter((n) => n.id !== center.id);
		const cx = 400;
		const cy = 260;
		const R = others.length > 6 ? 200 : 170;
		const placed: PlacedNode[] = [{ ...center, x: cx, y: cy, big: true }];
		others.forEach((n, i) => {
			const ang = (i / others.length) * Math.PI * 2 - Math.PI / 2;
			placed.push({ ...n, x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang), big: false });
		});
		return placed;
	});
	const posById = $derived(new Map(layout.map((n) => [n.id, n])));

	const connected = $derived.by(() => {
		const set = new Set<number>();
		if (selNode === null) return set;
		for (const [a, b] of graph.edges) {
			if (a === selNode) set.add(b);
			if (b === selNode) set.add(a);
		}
		return set;
	});
	const selected = $derived(graph.nodes.find((n) => n.id === selNode) ?? null);
	const connList = $derived(
		[...connected]
			.map((id) => graph.nodes.find((n) => n.id === id))
			.filter((n): n is GraphNode => !!n)
	);

	function startLinking() {
		linking = true;
		newLabel = '';
	}
	function cancelLinking() {
		linking = false;
		newLabel = '';
	}
	async function commitThought() {
		const label = newLabel.trim();
		if (!label || creating) return;
		creating = true;
		try {
			const id = await createNode(label);
			// Link to the currently selected thought; with none selected it's a root.
			if (selNode !== null) await linkNodes(selNode, id);
			await loadGraph();
			selNode = id;
			linking = false;
			newLabel = '';
		} catch (err) {
			console.error('failed to create thought:', err);
		} finally {
			creating = false;
		}
	}

	function focusInput(node: HTMLInputElement) {
		node.focus();
	}

	onMount(() => {
		loadEvents();
		loadCravings();
		loadGraph();
	});

	onDestroy(() => {
		stopSurf();
		clearTimeout(resetTimer);
	});
</script>

<div class="app">
	<!-- ===== SENTINEL BAR ===== -->
	<header class="bar">
		<div class="bar-left">
			<div class="dots"><span></span><span></span><span></span></div>
			<div class="brand">
				<span class="logo"><span></span></span>
				<span class="wordmark">Sentinel</span>
			</div>
			<div class="mode-pill">
				<span class="mode-dot" style="background:{cravingOpen ? 'var(--warm)' : 'var(--accent)'}"></span>
				<span class="mode-label">{cravingOpen ? 'Surfing' : 'Guarding'}</span>
			</div>
		</div>
		<div class="bar-right">
			<span class="shortcut">⌘⇧S</span>
			<button class="btn ghost" onclick={handleExport} disabled={exportStatus === 'exporting'}>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
				{exportStatus === 'exporting' ? 'Exporting…' : exportStatus === 'done' ? 'Exported' : exportStatus === 'error' ? 'Failed' : 'Export'}
			</button>
			<button class="btn accent" onclick={openCraving}>
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12c2-5 4-5 6 0s4 5 6 0 4-5 6 0"/></svg>
				Log a craving
			</button>
			<button class="icon-btn" title="Toggle theme" onclick={toggleTheme} aria-label="Toggle theme">
				{#if $theme === 'dark'}
					<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
				{:else}
					<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z"/></svg>
				{/if}
			</button>
		</div>
	</header>

	<!-- ===== BODY ===== -->
	<div class="body">
		<!-- SIDEBAR -->
		<nav class="sidebar">
			<div class="nav-heading">SURFACES</div>
			<div class="nav-group">
				<button class="nav-item" class:active={view === 'today'} onclick={() => (view = 'today')}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="16" rx="2.5"/><path d="M3.5 9h17M8 3v3M16 3v3"/><circle cx="12" cy="14.5" r="1.4" fill="currentColor" stroke="none"/></svg>
					Today
				</button>
				<button class="nav-item" class:active={view === 'cravings'} onclick={() => (view = 'cravings')}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12c2-5.5 4-5.5 6 0s4 5.5 6 0 4-5.5 6 0"/></svg>
					Cravings
				</button>
				<button class="nav-item" class:active={view === 'mind'} onclick={() => (view = 'mind')}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="7" r="2.4"/><circle cx="18" cy="6.5" r="2.4"/><circle cx="13" cy="17.5" r="2.4"/><path d="M7.8 8.6l3.6 7M16.2 8.2l-2.6 7.6M8.3 7l7.3-.3"/></svg>
					Mind tree
				</button>
			</div>
			<div class="nav-divider"></div>
			<div class="nav-group">
				<button class="nav-item muted">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2.2"/><circle cx="8" cy="17" r="2.2"/></svg>
					Rules
				</button>
				<button class="nav-item muted" onclick={handleExport}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg>
					Export
				</button>
			</div>
			<div class="local-card">
				<div class="local-head">
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>
					<span>Local-only</span>
				</div>
				<div class="local-path">~/Sentinel/events.db</div>
				<div class="local-note">Append-only. No cloud, no telemetry. Synced via Syncthing.</div>
			</div>
		</nav>

		<!-- MAIN -->
		<main class="main">
			{#if view === 'today'}
				<div class="page-pad">
					<div class="today-head">
						<div class="kicker">SUNDAY, JUNE 28</div>
						<h1>Good evening.</h1>
						<p class="sub">
							{#if surfedToday === 0}No urges surfed yet today. Mode is steady.{:else}You've surfed {surfedToday} {surfedToday === 1 ? 'urge' : 'urges'} today. Mode is steady.{/if}
						</p>
					</div>
					<div class="today-grid">
						<section class="card note-card">
							<div class="card-head">
								<span class="card-title">Daily note</span>
								<span class="card-meta">markdown · autosaved</span>
							</div>
							<div class="note-editor" use:noteEditor></div>
						</section>
						<div class="rail">
							<section class="card urge-card">
								<div class="urge-title">Feeling an urge?</div>
								<div class="urge-copy">Pause and check in. It takes about a minute, and no answer is wrong.</div>
								<button class="btn accent full" onclick={openCraving}>
									Start a check-in
									<span class="kbd">⌘⇧S</span>
								</button>
							</section>
							<section class="card">
								<div class="card-head plain">
									<span class="card-title">Today's events</span>
									<span class="card-meta">{events.length} logged</span>
								</div>
								<div class="timeline">
									{#if eventsLoading}
										<div class="tl-empty">Loading…</div>
									{:else if eventsError}
										<div class="tl-empty">Couldn't read events.db.</div>
									{:else if events.length === 0}
										<div class="tl-empty">No events logged today yet.</div>
									{:else}
										{#each events as ev, i (i)}
											<div class="tl-row">
												<div class="tl-rail">
													<span class="tl-dot" style="background:{eventDot(ev.kind)}"></span>
													{#if i < events.length - 1}<span class="tl-line"></span>{/if}
												</div>
												<div class="tl-body">
													<div class="tl-top">
														<span class="tl-label">{ev.label}</span>
														<span class="tl-time">{ev.time}</span>
													</div>
													{#if ev.detail}<div class="tl-detail">{ev.detail}</div>{/if}
												</div>
											</div>
										{/each}
									{/if}
								</div>
							</section>
						</div>
					</div>
				</div>
			{:else if view === 'cravings'}
				<div class="page-pad">
					<div class="page-head">
						<h1>Cravings</h1>
						<p class="sub">Every urge logged is an urge you stayed with. No judgment here.</p>
					</div>
					<div class="stat-grid">
						<div class="card stat">
							<div class="stat-label">SURFED · 7 DAYS</div>
							<div class="stat-value">{surfedCount}</div>
						</div>
						<div class="card stat">
							<div class="stat-label">SURF RATE</div>
							<div class="stat-value accent">{surfRate}%</div>
						</div>
						<div class="card stat">
							<div class="stat-label">AVG INTENSITY</div>
							<div class="stat-value">{avgIntensity}{#if avgIntensity !== '—'}<span class="stat-unit">/10</span>{/if}</div>
						</div>
					</div>
					<section class="card">
						<div class="card-head">
							<span class="card-title">Recent check-ins</span>
							<button class="btn soft" onclick={openCraving}>+ New check-in</button>
						</div>
						{#if cravingsLoading}
							<div class="list-empty">Loading…</div>
						{:else if cravingsError}
							<div class="list-empty">Couldn't read events.db.</div>
						{:else if historyRows.length === 0}
							<div class="list-empty">No check-ins in the last 7 days. Start one above.</div>
						{:else}
							{#each historyRows as h, i (i)}
								<div class="history-row">
									<span class="history-when">{h.when}</span>
									<div class="history-mid">
										<span class="hm-faint">HALT</span>
										<span class="hm-strong">{h.halt}</span>
										<span class="hm-sep">·</span>
										<span class="hm-muted">{h.trig}</span>
										<span class="hm-mono">intensity {h.intensity ?? '—'}</span>
									</div>
									<span class="badge" class:warm={h.out === 'smoked'}>{h.out === 'surfed' ? 'Surfed' : 'Gave in'}</span>
								</div>
							{/each}
						{/if}
					</section>
				</div>
			{:else}
				<div class="page-pad mind-pad">
					<div class="page-head">
						<h1>Mind tree</h1>
						<p class="sub">Map the thoughts behind the urge. Tap a node to follow the thread.</p>
					</div>
					<div class="mind-grid">
						<div class="graph">
							{#if graphLoading}
								<div class="graph-empty">Loading…</div>
							{:else if graphError}
								<div class="graph-empty">Couldn't read events.db.</div>
							{:else if graph.nodes.length === 0}
								<div class="graph-empty">
									<p class="graph-empty-title">No thoughts yet.</p>
									<p class="graph-empty-sub">Add your first thought to start mapping the urge.</p>
								</div>
							{:else}
								<svg viewBox="0 0 800 520" preserveAspectRatio="xMidYMid meet">
									{#each graph.edges as [a, b], i (i)}
										{@const on = a === selNode || b === selNode}
										{@const na = posById.get(a)}
										{@const nb = posById.get(b)}
										{#if na && nb}
											<line x1={na.x} y1={na.y} x2={nb.x} y2={nb.y} stroke={on ? 'var(--accent)' : 'var(--line-strong)'} stroke-width={on ? 2.2 : 1.4} />
										{/if}
									{/each}
									{#each layout as n (n.id)}
										{@const isSel = n.id === selNode}
										{@const isCon = connected.has(n.id)}
										{@const r = n.big ? 32 : 23}
										<g class="gnode" onclick={() => (selNode = n.id)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selNode = n.id; } }} role="button" tabindex="0" aria-label={n.label}>
											{#if isSel}<circle cx={n.x} cy={n.y} r={r + 8} fill="var(--accent-soft)" />{/if}
											<circle cx={n.x} cy={n.y} {r} fill={isSel ? 'var(--accent)' : 'var(--surface)'} stroke={isSel || isCon ? 'var(--accent)' : 'var(--line-strong)'} stroke-width={isSel ? 2.5 : isCon ? 1.9 : 1.4} />
											<text x={n.x} y={n.y + r + 18} text-anchor="middle" fill={isSel ? 'var(--accent-text)' : isCon ? 'var(--text)' : 'var(--muted)'} font-weight={isSel || isCon ? 600 : 500} class="gtext">{n.label}</text>
										</g>
									{/each}
								</svg>
							{/if}
						</div>
						<div class="card sel-panel">
							{#if selected}
								<div class="sel-kicker">SELECTED THOUGHT</div>
								<div class="sel-label">{selected.label}</div>
								<div class="sel-desc">{selected.description || 'No description yet.'}</div>
								<div class="nav-divider tight"></div>
								<div class="sel-count">Linked to {connected.size} {connected.size === 1 ? 'thought' : 'thoughts'}</div>
								<div class="chip-row">
									{#each connList as c (c.id)}
										<button class="chip" onclick={() => (selNode = c.id)}>{c.label}</button>
									{/each}
								</div>
							{:else}
								<div class="sel-kicker">MIND TREE</div>
								<div class="sel-label">Start mapping</div>
								<div class="sel-desc">Add a thought to begin. Each new thought links to the one you have selected.</div>
							{/if}

							{#if linking}
								<form class="link-form" onsubmit={(e) => { e.preventDefault(); commitThought(); }}>
									<input
										class="link-input"
										bind:value={newLabel}
										placeholder={selected ? `Linked to “${selected.label}”…` : 'First thought…'}
										disabled={creating}
										use:focusInput
										onkeydown={(e) => { if (e.key === 'Escape') cancelLinking(); }}
									/>
									<div class="link-actions">
										<button type="button" class="btn outline sm" onclick={cancelLinking} disabled={creating}>Cancel</button>
										<button type="submit" class="btn accent sm" disabled={creating || !newLabel.trim()}>{creating ? 'Adding…' : 'Add'}</button>
									</div>
								</form>
							{:else}
								<button class="link-btn" onclick={startLinking}>
									<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
									{selected ? 'Link a thought' : 'Add a thought'}
								</button>
							{/if}
						</div>
					</div>
				</div>
			{/if}
		</main>
	</div>

	<!-- ===== CRAVING OVERLAY ===== -->
	{#if cravingOpen}
		<div class="scrim">
			<div class="modal">
				<div class="modal-head">
					<div class="modal-stage">
						<span class="stage-dot"></span>
						<span class="stage-name">SURFING · {stepName}</span>
					</div>
					<button class="icon-btn plain" onclick={closeCraving} aria-label="Close">
						<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
					</button>
				</div>
				<div class="progress">
					<span style="background:{step >= 0 ? 'var(--accent)' : 'var(--line-strong)'}"></span>
					<span style="background:{step >= 1 ? 'var(--accent)' : 'var(--line-strong)'}"></span>
					<span style="background:{step >= 2 ? 'var(--accent)' : 'var(--line-strong)'}"></span>
				</div>

				{#if step === 0}
					<div class="step">
						<h2>Let's pause for a second.</h2>
						<p class="step-sub">Before the urge — how are you, really? These four often drive cravings. Tap any that fit.</p>
						<div class="halt-grid">
							<button class="halt" class:on={halt.H} onclick={() => (halt.H = !halt.H)}>
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v7a3 3 0 0 0 6 0V3M8 3v18M19 3c-1.5 0-2.5 2-2.5 5s1 4 2.5 4M19 12v9"/></svg>
								<div><div class="halt-t">Hungry</div><div class="halt-d">Need food or water?</div></div>
							</button>
							<button class="halt" class:on={halt.A} onclick={() => (halt.A = !halt.A)}>
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></svg>
								<div><div class="halt-t">Angry</div><div class="halt-d">Tense or frustrated?</div></div>
							</button>
							<button class="halt" class:on={halt.L} onclick={() => (halt.L = !halt.L)}>
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></svg>
								<div><div class="halt-t">Lonely</div><div class="halt-d">Wanting connection?</div></div>
							</button>
							<button class="halt" class:on={halt.T} onclick={() => (halt.T = !halt.T)}>
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z"/></svg>
								<div><div class="halt-t">Tired</div><div class="halt-d">Low on rest?</div></div>
							</button>
						</div>
						<div class="step-actions">
							<button class="btn outline" onclick={closeCraving}>Not now</button>
							<button class="btn accent grow" onclick={next}>Continue</button>
						</div>
					</div>
				{:else if step === 1}
					<div class="step">
						<h2>What's the urge like?</h2>
						<p class="step-sub">Naming it shrinks it. This stays on your machine.</p>
						<div class="slider-head">
							<span class="card-title">Intensity</span>
							<span class="slider-val">{intensity}/10 · {intensityLabel}</span>
						</div>
						<input
							type="range"
							min="1"
							max="10"
							bind:value={intensity}
							style="width:100%;background:linear-gradient(90deg,var(--accent) {rangePct}%,var(--line-strong) {rangePct}%)"
						/>
						<div class="slider-ends"><span>mild</span><span>intense</span></div>
						<div class="step-label">What's pulling at you?</div>
						<div class="chip-row">
							{#each TRIGGERS as [k, label] (k)}
								<button class="trig" class:on={trig[k]} onclick={() => (trig = { ...trig, [k]: !trig[k] })}>{label}</button>
							{/each}
						</div>
						<div class="step-actions">
							<button class="btn outline" onclick={back}>Back</button>
							<button class="btn accent grow" onclick={startSurf}>Surf the urge</button>
						</div>
					</div>
				{:else if step === 2}
					<div class="step center">
						<h2>Surf the urge.</h2>
						<p class="step-sub">Urges rise, peak, and pass — usually within a few minutes. Breathe with the circle and stay with it.</p>
						<div class="breath-wrap">
							<span class="ripple"></span>
							<div class="breath"><span>breathe</span></div>
						</div>
						<div class="surf-time">{surfText}</div>
						<div class="surf-meta">staying with it · {haltSummary}</div>
						<div class="step-actions">
							<button class="btn outline" onclick={() => finish('smoked')}>I gave in</button>
							<button class="btn accent grow" onclick={() => finish('surfed')}>I surfed it</button>
						</div>
					</div>
				{:else}
					<div class="step center">
						<div class="done-check">
							<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
						</div>
						<h2>{outSurfed ? 'You surfed it.' : 'Logged. No judgment.'}</h2>
						<p class="step-sub">{outSurfed ? 'The urge rose and passed, and you stayed. That counts.' : 'You showed up and named it. That awareness is the work — next time is a new try.'}</p>
						<div class="summary">
							<div class="sum-row"><span>HALT</span><strong>{haltSummary}</strong></div>
							<div class="sum-row"><span>Intensity</span><strong>{intensity}/10 · {intensityLabel}</strong></div>
							<div class="sum-row"><span>Outcome</span><strong style="color:{outSurfed ? 'var(--accent-text)' : 'var(--warm-text)'}">{outSurfed ? 'Surfed' : 'Gave in'}</strong></div>
							<div class="sum-row"><span>Saved</span><span class="sum-mono">events.db · local</span></div>
						</div>
						<button class="btn accent full" onclick={doneCraving}>Done</button>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	:global(html),
	:global(body) {
		height: 100%;
	}
	:global(body) {
		background: var(--backdrop);
		color: var(--text);
		font-family: var(--font-sans);
		-webkit-font-smoothing: antialiased;
	}

	.app {
		--frame-radius: 16px;
		min-height: 100vh;
		background: var(--backdrop);
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 26px;
	}
	.bar,
	.body {
		width: 100%;
		max-width: 1200px;
	}

	.bar {
		height: 56px;
		flex: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 18px;
		border: 1px solid var(--line);
		border-bottom: none;
		border-radius: var(--frame-radius) var(--frame-radius) 0 0;
		background: var(--surface-2);
		box-shadow: var(--shadow);
	}
	.bar-left {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.dots {
		display: flex;
		gap: 7px;
	}
	.dots span {
		width: 11px;
		height: 11px;
		border-radius: 50%;
		background: var(--line-strong);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 9px;
		padding-left: 6px;
		border-left: 1px solid var(--line-strong);
	}
	.logo {
		width: 14px;
		height: 14px;
		border-radius: 5px;
		border: 1.5px solid var(--accent);
		display: inline-block;
		position: relative;
	}
	.logo span {
		position: absolute;
		inset: 3px;
		border-radius: 2px;
		background: var(--accent);
	}
	.wordmark {
		font-weight: 700;
		letter-spacing: 0.2px;
		font-size: 14.5px;
	}
	.mode-pill {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 11px;
		border-radius: 99px;
		background: var(--surface);
		border: 1px solid var(--line);
	}
	.mode-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
	}
	.mode-label {
		font: 500 12px/1 var(--font-mono);
		color: var(--muted);
	}
	.bar-right {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.shortcut {
		font: 500 11.5px/1 var(--font-mono);
		color: var(--faint);
		padding: 6px 9px;
		border: 1px solid var(--line);
		border-radius: 7px;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		border-radius: 9px;
		padding: 9px 15px;
		font: 600 13px var(--font-sans);
		cursor: pointer;
		border: 1px solid transparent;
		transition: filter 0.15s, background 0.15s, color 0.15s, border-color 0.15s;
	}
	.btn:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.btn.ghost {
		background: transparent;
		border-color: var(--line-strong);
		color: var(--text);
		padding: 8px 13px;
	}
	.btn.ghost:hover:not(:disabled) {
		background: var(--surface-3);
	}
	.btn.accent {
		background: var(--accent);
		color: #fff;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
	}
	.btn.accent:hover:not(:disabled) {
		filter: brightness(1.07);
	}
	.btn.soft {
		background: var(--accent-soft);
		color: var(--accent-text);
		padding: 8px 13px;
	}
	.btn.soft:hover {
		filter: brightness(0.97);
	}
	.btn.outline {
		background: transparent;
		border-color: var(--line-strong);
		color: var(--muted);
		padding: 13px 18px;
		font-size: 14px;
	}
	.btn.outline:hover {
		color: var(--text);
	}
	.btn.full {
		width: 100%;
		padding: 12px;
		font-size: 14px;
	}
	.btn.grow {
		flex: 1;
		padding: 13px;
		font-size: 14.5px;
	}
	.kbd {
		font: 500 11px var(--font-mono);
		opacity: 0.7;
	}

	.icon-btn {
		width: 38px;
		height: 38px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: 1px solid var(--line);
		color: var(--muted);
		border-radius: 9px;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}
	.icon-btn:hover {
		background: var(--surface-3);
		color: var(--text);
	}
	.icon-btn.plain {
		border-color: transparent;
		width: 34px;
		height: 34px;
		color: var(--faint);
	}
	.icon-btn.plain:hover {
		background: var(--surface-2);
		color: var(--text);
	}

	.body {
		flex: 1;
		display: flex;
		min-height: 0;
		height: calc(100vh - 52px - 56px);
		min-height: 584px;
		border: 1px solid var(--line);
		border-top: none;
		border-radius: 0 0 var(--frame-radius) var(--frame-radius);
		background: var(--surface);
		box-shadow: var(--shadow);
		overflow: hidden;
		position: relative;
	}

	.sidebar {
		width: 226px;
		flex: none;
		border-right: 1px solid var(--line);
		background: var(--surface-2);
		display: flex;
		flex-direction: column;
		padding: 18px 14px;
	}
	.nav-heading {
		font: 500 10.5px/1 var(--font-mono);
		letter-spacing: 1.5px;
		color: var(--faint);
		padding: 6px 10px 12px;
	}
	.nav-group {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.nav-item {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 11px 12px;
		border: none;
		border-radius: 10px;
		background: transparent;
		color: var(--muted);
		font: 500 14.5px var(--font-sans);
		cursor: pointer;
		text-align: left;
		transition: background 0.15s, color 0.15s;
	}
	.nav-item:hover {
		background: var(--surface-3);
		color: var(--text);
	}
	.nav-item.active {
		background: var(--accent-soft);
		color: var(--accent-text);
		font-weight: 600;
	}
	.nav-divider {
		height: 1px;
		background: var(--line);
		margin: 14px 8px;
	}
	.nav-divider.tight {
		margin: 18px 0;
	}
	.local-card {
		margin-top: auto;
		padding: 13px;
		border-radius: 12px;
		background: var(--surface);
		border: 1px solid var(--line);
	}
	.local-head {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 7px;
		font-weight: 600;
		font-size: 12.5px;
	}
	.local-path {
		font: 400 11px/1.5 var(--font-mono);
		color: var(--faint);
		word-break: break-all;
	}
	.local-note {
		font-size: 11.5px;
		color: var(--muted);
		margin-top: 7px;
		line-height: 1.4;
	}

	.main {
		flex: 1;
		min-width: 0;
		overflow: auto;
		background: var(--surface);
	}
	.page-pad {
		padding: 36px 40px;
		max-width: 1000px;
	}
	.mind-pad {
		display: flex;
		flex-direction: column;
		height: 100%;
		padding-bottom: 0;
	}
	.page-head {
		margin-bottom: 26px;
	}
	h1 {
		margin: 0;
		font-size: 30px;
		font-weight: 700;
		letter-spacing: -0.5px;
	}
	.sub {
		margin: 7px 0 0;
		color: var(--muted);
		font-size: 15px;
	}
	.today-head {
		margin-bottom: 28px;
	}
	.kicker {
		font: 500 12px/1 var(--font-mono);
		color: var(--accent-text);
		letter-spacing: 0.5px;
		margin-bottom: 9px;
	}

	.card {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 14px;
	}
	.card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 18px;
		border-bottom: 1px solid var(--line);
	}
	.card-head.plain {
		border-bottom: none;
		padding: 18px 18px 4px;
	}
	.card-title {
		font-weight: 600;
		font-size: 14px;
	}
	.card-meta {
		font: 400 11.5px/1 var(--font-mono);
		color: var(--faint);
	}

	.today-grid {
		display: grid;
		grid-template-columns: 1.5fr 1fr;
		gap: 22px;
		align-items: start;
	}
	.note-card {
		overflow: hidden;
	}
	.note-editor {
		min-height: 300px;
	}
	.note-editor :global(.cm-editor) {
		min-height: 300px;
	}
	.rail {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.urge-card {
		background: linear-gradient(160deg, var(--accent-soft), var(--surface));
		padding: 20px;
	}
	.urge-title {
		font-weight: 600;
		font-size: 15px;
		margin-bottom: 5px;
	}
	.urge-copy {
		color: var(--muted);
		font-size: 13.5px;
		line-height: 1.5;
		margin-bottom: 15px;
	}

	.timeline {
		padding: 6px 18px 16px;
	}
	.tl-empty {
		padding: 14px 0 6px;
		color: var(--faint);
		font-size: 13px;
	}
	.list-empty {
		padding: 22px 20px;
		color: var(--faint);
		font-size: 13.5px;
	}
	.tl-row {
		display: flex;
		gap: 13px;
		padding: 9px 0;
	}
	.tl-rail {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-top: 3px;
	}
	.tl-dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		flex: none;
	}
	.tl-line {
		width: 1px;
		flex: 1;
		background: var(--line);
		margin-top: 4px;
	}
	.tl-body {
		flex: 1;
	}
	.tl-top {
		display: flex;
		justify-content: space-between;
		gap: 8px;
	}
	.tl-label {
		font-weight: 600;
		font-size: 13.5px;
	}
	.tl-time {
		font: 400 11.5px var(--font-mono);
		color: var(--faint);
		flex: none;
	}
	.tl-detail {
		color: var(--muted);
		font-size: 12.5px;
		margin-top: 2px;
	}

	.stat-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 16px;
		margin-bottom: 26px;
	}
	.stat {
		padding: 18px;
	}
	.stat-label {
		font: 500 11.5px var(--font-mono);
		color: var(--muted);
		margin-bottom: 10px;
	}
	.stat-value {
		font-size: 30px;
		font-weight: 700;
		letter-spacing: -1px;
	}
	.stat-value.accent {
		color: var(--accent-text);
	}
	.stat-unit {
		font-size: 16px;
		color: var(--faint);
		font-weight: 500;
	}

	.history-row {
		display: grid;
		grid-template-columns: 170px 1fr auto;
		gap: 16px;
		align-items: center;
		padding: 15px 20px;
		border-bottom: 1px solid var(--line);
	}
	.history-row:last-child {
		border-bottom: none;
	}
	.history-when {
		font: 400 12.5px var(--font-mono);
		color: var(--muted);
	}
	.history-mid {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.hm-faint {
		font-size: 13px;
		color: var(--faint);
	}
	.hm-strong {
		font-weight: 600;
		font-size: 13.5px;
	}
	.hm-sep {
		color: var(--line-strong);
	}
	.hm-muted {
		font-size: 13px;
		color: var(--muted);
	}
	.hm-mono {
		font: 500 11.5px var(--font-mono);
		color: var(--faint);
	}
	.badge {
		padding: 6px 12px;
		border-radius: 99px;
		font: 600 12px var(--font-sans);
		background: var(--accent-soft);
		color: var(--accent-text);
	}
	.badge.warm {
		background: var(--warm-soft);
		color: var(--warm-text);
	}

	.mind-grid {
		flex: 1;
		display: grid;
		grid-template-columns: 1fr 300px;
		gap: 22px;
		min-height: 0;
		padding-bottom: 36px;
	}
	.graph {
		background: var(--surface-2);
		border: 1px solid var(--line);
		border-radius: 16px;
		overflow: hidden;
		background-image: radial-gradient(var(--line-strong) 1px, transparent 1px);
		background-size: 24px 24px;
		padding: 18px;
	}
	.graph svg {
		width: 100%;
		height: 100%;
		display: block;
	}
	.graph-empty {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		color: var(--faint);
		font-size: 13.5px;
		text-align: center;
	}
	.graph-empty-title {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: var(--muted);
	}
	.graph-empty-sub {
		margin: 0;
		max-width: 260px;
	}
	.gnode {
		cursor: pointer;
	}
	.gnode circle,
	.gnode text {
		transition: all 0.25s;
	}
	.gtext {
		font: 12.5px var(--font-mono);
		pointer-events: none;
	}
	.graph line {
		transition: stroke 0.25s, stroke-width 0.25s;
	}
	.sel-panel {
		padding: 22px;
		display: flex;
		flex-direction: column;
	}
	.sel-kicker {
		font: 500 11.5px var(--font-mono);
		color: var(--faint);
		letter-spacing: 1px;
		margin-bottom: 12px;
	}
	.sel-label {
		font-size: 22px;
		font-weight: 700;
		letter-spacing: -0.3px;
		margin-bottom: 6px;
	}
	.sel-desc {
		color: var(--muted);
		font-size: 13.5px;
		line-height: 1.5;
	}
	.sel-count {
		font-size: 12.5px;
		color: var(--faint);
		margin-bottom: 11px;
	}
	.chip-row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.chip {
		background: var(--surface-2);
		border: 1px solid var(--line);
		color: var(--text);
		border-radius: 99px;
		padding: 7px 13px;
		font: 500 12.5px var(--font-sans);
		cursor: pointer;
		transition: border-color 0.15s, color 0.15s;
	}
	.chip:hover {
		border-color: var(--accent);
		color: var(--accent-text);
	}
	.link-btn {
		margin-top: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		background: transparent;
		border: 1px dashed var(--line-strong);
		color: var(--muted);
		border-radius: 10px;
		padding: 11px;
		font: 600 13px var(--font-sans);
		cursor: pointer;
		transition: border-color 0.15s, color 0.15s;
	}
	.link-btn:hover {
		border-color: var(--accent);
		color: var(--accent-text);
	}
	.link-form {
		margin-top: auto;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.link-input {
		width: 100%;
		padding: 11px 12px;
		border-radius: 10px;
		border: 1px solid var(--line-strong);
		background: var(--surface-2);
		color: var(--text);
		font: 500 13.5px var(--font-sans);
		outline: none;
	}
	.link-input:focus {
		border-color: var(--accent);
	}
	.link-input::placeholder {
		color: var(--faint);
	}
	.link-actions {
		display: flex;
		gap: 8px;
	}
	.btn.sm {
		flex: 1;
		padding: 9px;
		font-size: 13px;
	}

	/* ===== craving overlay ===== */
	.scrim {
		position: absolute;
		inset: 0;
		z-index: 50;
		background: rgba(8, 12, 11, 0.42);
		backdrop-filter: blur(7px);
		-webkit-backdrop-filter: blur(7px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 32px;
		animation: fadeIn 0.2s ease;
	}
	.modal {
		width: 100%;
		max-width: 580px;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 20px;
		box-shadow: var(--shadow-pop);
		overflow: hidden;
		animation: popIn 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	.modal-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 18px 22px 0;
	}
	.modal-stage {
		display: flex;
		align-items: center;
		gap: 9px;
	}
	.stage-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--warm);
	}
	.stage-name {
		font: 500 12px var(--font-mono);
		color: var(--muted);
	}
	.progress {
		display: flex;
		gap: 6px;
		padding: 14px 22px 0;
	}
	.progress span {
		height: 3px;
		flex: 1;
		border-radius: 99px;
	}
	.step {
		padding: 24px 26px 26px;
	}
	.step.center {
		text-align: center;
	}
	.step h2 {
		margin: 0 0 6px;
		font-size: 23px;
		font-weight: 700;
		letter-spacing: -0.4px;
	}
	.step-sub {
		margin: 0 0 22px;
		color: var(--muted);
		font-size: 14.5px;
		line-height: 1.5;
	}
	.halt-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.halt {
		display: flex;
		align-items: center;
		gap: 13px;
		padding: 15px 14px;
		border-radius: 14px;
		cursor: pointer;
		text-align: left;
		transition: all 0.15s;
		font-family: var(--font-sans);
		background: var(--surface-2);
		border: 1.5px solid transparent;
		color: var(--text);
	}
	.halt.on {
		background: var(--accent-soft);
		border-color: var(--accent);
		color: var(--accent-text);
	}
	.halt-t {
		font-weight: 700;
		font-size: 15px;
	}
	.halt-d {
		font-size: 12px;
		opacity: 0.75;
	}
	.step-actions {
		display: flex;
		gap: 10px;
		margin-top: 24px;
	}
	.slider-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 12px;
	}
	.slider-val {
		font: 500 13px var(--font-mono);
		color: var(--accent-text);
	}
	.slider-ends {
		display: flex;
		justify-content: space-between;
		font: 400 11px var(--font-mono);
		color: var(--faint);
		margin-top: 6px;
	}
	.step-label {
		font-weight: 600;
		font-size: 14px;
		margin: 24px 0 12px;
	}
	.trig {
		border-radius: 99px;
		padding: 9px 15px;
		font: 500 13px var(--font-sans);
		cursor: pointer;
		transition: all 0.15s;
		background: var(--surface-2);
		border: 1px solid var(--line);
		color: var(--text);
	}
	.trig.on {
		background: var(--accent-soft);
		border-color: var(--accent);
		color: var(--accent-text);
	}
	.breath-wrap {
		position: relative;
		height: 230px;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 6px 0;
	}
	.ripple {
		position: absolute;
		width: 180px;
		height: 180px;
		border-radius: 50%;
		background: var(--accent);
		opacity: 0.12;
		animation: ripple 4s ease-out infinite;
	}
	.breath {
		width: 180px;
		height: 180px;
		border-radius: 50%;
		background: radial-gradient(circle at 38% 32%, var(--accent), var(--accent-text));
		animation: breathe 8s ease-in-out infinite;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
	}
	.breath span {
		color: #fff;
		font: 500 14px var(--font-mono);
		letter-spacing: 1px;
		opacity: 0.9;
	}
	.surf-time {
		font: 500 34px var(--font-mono);
		letter-spacing: 1px;
		margin: 4px 0 2px;
	}
	.surf-meta {
		font-size: 12.5px;
		color: var(--faint);
		margin-bottom: 22px;
	}
	.done-check {
		width: 60px;
		height: 60px;
		border-radius: 50%;
		background: var(--accent-soft);
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0 auto 18px;
	}
	.summary {
		text-align: left;
		background: var(--surface-2);
		border: 1px solid var(--line);
		border-radius: 13px;
		padding: 6px 18px;
		margin-bottom: 22px;
	}
	.sum-row {
		display: flex;
		justify-content: space-between;
		padding: 11px 0;
		border-bottom: 1px solid var(--line);
		font-size: 13.5px;
	}
	.sum-row:last-child {
		border-bottom: none;
	}
	.sum-row span:first-child {
		color: var(--muted);
	}
	.sum-row strong {
		font-weight: 600;
	}
	.sum-mono {
		font: 500 12.5px var(--font-mono);
		color: var(--faint);
	}
</style>
