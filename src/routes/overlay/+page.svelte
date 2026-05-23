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
		background: #1a1a2e;
		border: 1px solid #3a3a5c;
		border-radius: 12px;
		padding: 24px;
		box-sizing: border-box;
		font-family: inherit;
		color: #e8e8ff;
	}

	.prompt {
		font-size: 14px;
		color: #9898cc;
		margin: 0;
		text-align: center;
	}

	.timer {
		font-size: 48px;
		font-variant-numeric: tabular-nums;
		font-weight: 300;
		color: #e8e8ff;
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
		padding: 10px 0;
		background: #2a2a4a;
		border: 1px solid #3a3a5c;
		border-radius: 8px;
		color: #7878aa;
		font-size: 13px;
		font-family: monospace;
		cursor: pointer;
		transition: background 0.1s, color 0.1s, border-color 0.1s;
		user-select: none;
	}

	.halt-btn:hover {
		background: #3a3a5c;
		color: #c8c8ee;
	}

	.halt-btn.active {
		background: #3a2a5c;
		border-color: #7878cc;
		color: #c8b8ff;
	}

	.action-btn {
		padding: 10px 24px;
		border-radius: 8px;
		font-size: 14px;
		font-family: inherit;
		cursor: pointer;
		border: none;
		transition: opacity 0.1s;
		user-select: none;
	}

	.action-btn:hover {
		opacity: 0.85;
	}

	.action-btn.primary {
		background: #5a4a8c;
		color: #e8e8ff;
		width: 100%;
		padding: 12px 0;
	}

	.resolve-row {
		display: flex;
		gap: 12px;
		width: 100%;
	}

	.action-btn.surf {
		flex: 1;
		background: #2a5c3a;
		color: #a8e8b8;
	}

	.action-btn.smoke {
		flex: 1;
		background: #3a2a2a;
		color: #e8a8a8;
	}
</style>
