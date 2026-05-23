<script lang="ts">
	import { onMount } from 'svelte';
	import { EditorView, keymap } from '@codemirror/view';
	import { EditorState } from '@codemirror/state';
	import { basicSetup } from 'codemirror';
	import { markdown } from '@codemirror/lang-markdown';
	import { readDailyNote, writeDailyNote, saveNote, localDate } from '$lib/note/index.js';

	const date = localDate();

	let container = $state<HTMLDivElement | null>(null);

	const darkTheme = EditorView.theme(
		{
			'&': { backgroundColor: '#1a1a2e', color: '#e8e8ff', height: '100%' },
			'.cm-scroller': { overflow: 'auto', fontFamily: 'monospace', fontSize: '15px' },
			'.cm-content': { caretColor: '#9898cc', padding: '16px 20px' },
			'.cm-cursor': { borderLeftColor: '#9898cc' },
			'.cm-gutters': {
				backgroundColor: '#1a1a2e',
				borderRight: '1px solid #2a2a4a',
				color: '#4a4a6a'
			},
			'.cm-activeLineGutter': { backgroundColor: '#1f1f38' },
			'.cm-activeLine': { backgroundColor: '#1f1f38' },
			'.cm-selectionBackground': { backgroundColor: '#3a3a5c !important' },
			'.cm-focused .cm-selectionBackground': { backgroundColor: '#3a3a5c !important' }
		},
		{ dark: true }
	);

	onMount(() => {
		if (!container) return;

		let destroyed = false;
		let view: EditorView | undefined;
		let debounceTimer: ReturnType<typeof setTimeout> | undefined;

		const saveCmd = () => {
			clearTimeout(debounceTimer);
			const content = view?.state.doc.toString() ?? '';
			saveNote(date, content).catch(console.error);
			return true;
		};

		readDailyNote(date)
			.then((content) => {
				if (destroyed) return;
				view = new EditorView({
					state: EditorState.create({
						doc: content,
						extensions: [
							basicSetup,
							markdown(),
							darkTheme,
							keymap.of([{ key: 'Mod-s', run: saveCmd }]),
							EditorView.updateListener.of((update) => {
								if (!update.docChanged) return;
								clearTimeout(debounceTimer);
								debounceTimer = setTimeout(() => {
									writeDailyNote(date, update.state.doc.toString()).catch(console.error);
								}, 1000);
							})
						]
					}),
					parent: container!
				});
			})
			.catch(console.error);

		return () => {
			destroyed = true;
			clearTimeout(debounceTimer);
			if (view) {
				writeDailyNote(date, view.state.doc.toString()).catch(console.error);
				view.destroy();
			}
		};
	});
</script>

<div class="page">
	<header class="note-header">
		<span class="date-label">{date}</span>
	</header>
	<div class="editor-wrap" bind:this={container}></div>
</div>

<style>
	:global(html, body) {
		margin: 0;
		padding: 0;
		height: 100%;
		background: #1a1a2e;
		color: #e8e8ff;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
	}

	.page {
		display: flex;
		flex-direction: column;
		height: 100vh;
	}

	.note-header {
		display: flex;
		align-items: center;
		padding: 10px 20px;
		background: #1a1a2e;
		border-bottom: 1px solid #2a2a4a;
		flex-shrink: 0;
	}

	.date-label {
		font-family: monospace;
		font-size: 13px;
		color: #7878aa;
		letter-spacing: 0.05em;
	}

	.editor-wrap {
		flex: 1;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.editor-wrap :global(.cm-editor) {
		height: 100%;
	}
</style>
