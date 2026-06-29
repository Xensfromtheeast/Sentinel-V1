import { writable } from 'svelte/store';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'sentinel:theme';

function initial(): Theme {
	if (typeof localStorage !== 'undefined') {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved === 'light' || saved === 'dark') return saved;
	}
	if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches) {
		return 'dark';
	}
	return 'light';
}

export const theme = writable<Theme>(initial());

theme.subscribe((value) => {
	if (typeof document !== 'undefined') {
		document.documentElement.setAttribute('data-theme', value);
	}
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem(STORAGE_KEY, value);
	}
});

export function toggleTheme(): void {
	theme.update((t) => (t === 'light' ? 'dark' : 'light'));
}
