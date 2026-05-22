import { writable } from 'svelte/store';

export type AppMode = 'event-day' | 'studio-day';

export const mode = writable<AppMode>('studio-day');
