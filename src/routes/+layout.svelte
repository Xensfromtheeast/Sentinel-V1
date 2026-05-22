<script lang="ts">
	import { onMount } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';
	import { WebviewWindow, getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
	import { register, unregister } from '@tauri-apps/plugin-global-shortcut';

	let { children } = $props();

	const SHORTCUT = 'Ctrl+Alt+Space';

	onMount(() => {
		const win = getCurrentWebviewWindow();
		if (win.label !== 'main') return;

		async function setup() {
			let barOrNull = await WebviewWindow.getByLabel('bar');
			if (!barOrNull) {
				try {
					barOrNull = new WebviewWindow('bar', {
						url: '/bar',
						decorations: false,
						alwaysOnTop: true,
						width: 600,
						height: 48,
						visible: false,
						skipTaskbar: true,
						resizable: false,
						title: 'Sentinel Bar'
					});
				} catch {
					barOrNull = await WebviewWindow.getByLabel('bar');
				}
			}
			if (!barOrNull) return;
			const barRef = barOrNull;

			async function toggleBar() {
				const visible = await barRef.isVisible();
				if (visible) {
					await barRef.hide();
				} else {
					await barRef.show();
					await barRef.setFocus();
				}
			}

			await register(SHORTCUT, toggleBar);
		}

		setup().catch(console.error);

		return () => {
			unregister(SHORTCUT).catch(console.error);
		};
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
