<script lang="ts">
	import { onMount } from 'svelte';
	import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
	import { logCraving, resolveAsSurfed, resolveAsSmoked } from '$lib/overlay/actions.js';
	import type { HaltFlags } from '$lib/types/events.js';

	type Phase = 'halt' | 'surfing';

	let phase = $state<Phase>('halt');
	let halt = $state<HaltFlags>({ hungry: false, angry: false, lonely: false, tired: false });
	let elapsed = $state(0);
	let startedAt = 0;

	const win = getCurrentWebviewWindow();
	let interval: ReturnType<typeof setInterval> | undefined;

	function reset() {
		clearInterval(interval);
		interval = undefined;
		phase = 'halt';
		halt = { hungry: false, angry: false, lonely: false, tired: false };
		elapsed = 0;
		startedAt = 0;
	}

	function toggle(flag: keyof HaltFlags) {
		halt[flag] = !halt[flag];
	}

	async function hide() {
		reset();
		await win.hide();
	}

	async function handleLogCraving() {
		await logCraving(halt);
		startedAt = Date.now();
		elapsed = 0;
		phase = 'surfing';
		interval = setInterval(() => {
			elapsed = Math.floor((Date.now() - startedAt) / 1000);
		}, 1000);
	}

	async function handleSurfed() {
		await resolveAsSurfed(startedAt).catch(console.error);
		await hide();
	}

	async function handleSmoked() {
		await resolveAsSmoked(startedAt).catch(console.error);
		await hide();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			hide();
		}
	}

	onMount(() => {
		let unlisten: (() => void) | undefined;
		win
			.onFocusChanged(({ payload: focused }) => {
				if (focused && phase === 'halt') {
					reset();
				}
			})
			.then((fn) => {
				unlisten = fn;
			});
		return () => {
			unlisten?.();
			clearInterval(interval);
		};
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="overlay" role="dialog" aria-label="Craving Check">
	{#if phase === 'halt'}
		<p class="prompt">How are you feeling right now?</p>
		<div class="halt-grid">
			<button
				class="halt-btn"
				class:active={halt.hungry}
				onclick={() => toggle('hungry')}
				aria-pressed={halt.hungry}
			>H — Hungry</button>
			<button
				class="halt-btn"
				class:active={halt.angry}
				onclick={() => toggle('angry')}
				aria-pressed={halt.angry}
			>A — Angry</button>
			<button
				class="halt-btn"
				class:active={halt.lonely}
				onclick={() => toggle('lonely')}
				aria-pressed={halt.lonely}
			>L — Lonely</button>
			<button
				class="halt-btn"
				class:active={halt.tired}
				onclick={() => toggle('tired')}
				aria-pressed={halt.tired}
			>T — Tired</button>
		</div>
		<button class="action-btn primary" onclick={handleLogCraving}>Log Craving →</button>
	{:else}
		<p class="timer">{elapsed}s</p>
		<p class="prompt">Ride it out — urges peak and pass.</p>
		<div class="resolve-row">
			<button class="action-btn surf" onclick={handleSurfed}>✓ Surfed it!</button>
			<button class="action-btn smoke" onclick={handleSmoked}>✗ Smoked</button>
		</div>
	{/if}
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		background: transparent;
		overflow: hidden;
	}

	.overlay {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 18px;
		height: 320px;
		width: 440px;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 16px;
		padding: 26px;
		box-sizing: border-box;
		font-family: var(--font-sans);
		color: var(--text);
		box-shadow: var(--shadow-pop);
	}

	.prompt {
		font-size: 14.5px;
		color: var(--muted);
		margin: 0;
		text-align: center;
		line-height: 1.5;
	}

	.timer {
		font-family: var(--font-mono);
		font-size: 44px;
		font-variant-numeric: tabular-nums;
		font-weight: 500;
		color: var(--text);
		margin: 0;
		letter-spacing: 0.02em;
	}

	.halt-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
		width: 100%;
	}

	.halt-btn {
		padding: 12px 0;
		background: var(--surface-2);
		border: 1.5px solid transparent;
		border-radius: 12px;
		color: var(--text);
		font-size: 13px;
		font-family: var(--font-sans);
		font-weight: 600;
		cursor: pointer;
		transition: background 0.12s, color 0.12s, border-color 0.12s;
		user-select: none;
	}

	.halt-btn:hover {
		background: var(--surface-3);
	}

	.halt-btn.active {
		background: var(--accent-soft);
		border-color: var(--accent);
		color: var(--accent-text);
	}

	.action-btn {
		padding: 12px 24px;
		border-radius: 11px;
		font-size: 14px;
		font-family: var(--font-sans);
		font-weight: 600;
		cursor: pointer;
		border: none;
		transition: filter 0.12s;
		user-select: none;
	}

	.action-btn:hover {
		filter: brightness(1.07);
	}

	.action-btn.primary {
		background: var(--accent);
		color: #fff;
		width: 100%;
		padding: 13px 0;
	}

	.resolve-row {
		display: flex;
		gap: 12px;
		width: 100%;
	}

	.action-btn.surf {
		flex: 1;
		background: var(--accent);
		color: #fff;
	}

	.action-btn.smoke {
		flex: 1;
		background: var(--warm-soft);
		color: var(--warm-text);
	}
</style>
