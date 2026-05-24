<script lang="ts">
	import { onMount } from 'svelte';
	import { getCurrentWebviewWindow, WebviewWindow } from '@tauri-apps/api/webviewWindow';
	import { mode } from '$lib/stores/mode.js';
	import { classifyFirstKey, dispatchBarInput } from '$lib/bar/actions.js';
	import type { BarMode } from '$lib/bar/actions.js';

	let inputEl = $state<HTMLInputElement | null>(null);
	let value = $state('');
	let barMode = $state<BarMode>('idle');
	let placeholder = $state('c · t · i · f · anything…');

	const win = getCurrentWebviewWindow();
	let intercepting = false;

	const IDLE_PLACEHOLDER = 'c · t · i · f · anything…';

	function reset() {
		value = '';
		barMode = 'idle';
		placeholder = IDLE_PLACEHOLDER;
	}

	async function hide() {
		reset();
		await win.hide();
	}

	async function submit() {
		if (barMode === 'idle') return;
		if (!value.trim()) {
			await hide();
			return;
		}
		await dispatchBarInput(barMode, value);
		await hide();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			hide();
			return;
		}

		if (e.key === 'Enter') {
			e.preventDefault();
			submit();
			return;
		}

		if (barMode === 'idle') {
			e.preventDefault();
			const result = classifyFirstKey(e.key.toLowerCase());
			if (result.immediate) {
				if (result.mode === 'craving' && !intercepting) {
					intercepting = true;
					WebviewWindow.getByLabel('overlay').then((overlay) => {
						if (!overlay) return;
						return overlay.show().then(() => overlay.setFocus());
					}).then(() => hide()).catch(console.error).finally(() => { intercepting = false; });
					return;
				}
				dispatchBarInput(result.mode, '').then(() => hide()).catch(console.error);
				return;
			}
			barMode = result.mode;
			placeholder = result.placeholder;
			if (result.mode === 'freetext') {
				value = e.key === 'Backspace' ? '' : e.key;
			}
		}
	}

	onMount(() => {
		let unlisten: (() => void) | undefined;
		win
			.onFocusChanged(({ payload: focused }) => {
				if (focused) {
					reset();
					inputEl?.focus();
				}
			})
			.then((fn) => {
				unlisten = fn;
			});
		return () => unlisten?.();
	});
</script>

<div class="bar" role="application" aria-label="Sentinel Bar">
	<span class="mode-badge">{$mode}</span>
	<!-- svelte-ignore a11y_autofocus -->
	<input
		bind:this={inputEl}
		bind:value
		type="text"
		class="bar-input"
		{placeholder}
		autofocus
		onkeydown={handleKeydown}
		spellcheck={false}
		autocomplete="off"
	/>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		background: transparent;
		overflow: hidden;
	}

	.bar {
		display: flex;
		align-items: center;
		height: 48px;
		background: #1a1a2e;
		border: 1px solid #3a3a5c;
		border-radius: 8px;
		padding: 0 12px;
		gap: 10px;
		box-sizing: border-box;
		width: 100%;
	}

	.mode-badge {
		font-family: monospace;
		font-size: 11px;
		color: #7878aa;
		white-space: nowrap;
		user-select: none;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.bar-input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		color: #e8e8ff;
		font-size: 15px;
		font-family: inherit;
		caret-color: #9898cc;
	}

	.bar-input::placeholder {
		color: #4a4a6a;
	}
</style>
