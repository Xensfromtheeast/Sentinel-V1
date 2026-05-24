import { vi } from 'vitest';

// Mock the Tauri SQL plugin so any test can import app code that
// transitively depends on the native SQLite plugin without it crashing
// in the Node test environment.
vi.mock('@tauri-apps/plugin-sql', () => ({
	default: {
		load: vi.fn().mockResolvedValue({
			execute: vi.fn().mockResolvedValue(undefined),
			select: vi.fn().mockResolvedValue([])
		})
	}
}));

// Mock Tauri core invoke so any code that calls into Rust commands
// (e.g. note/index.ts) also resolves cleanly in tests.
vi.mock('@tauri-apps/api/core', () => ({
	invoke: vi.fn().mockResolvedValue(null)
}));

// Mock the notification plugin so notification helpers can be imported
// in tests without a Tauri runtime.
vi.mock('@tauri-apps/plugin-notification', () => ({
	sendNotification: vi.fn().mockResolvedValue(undefined),
	isPermissionGranted: vi.fn().mockResolvedValue(true),
	requestPermission: vi.fn().mockResolvedValue('granted')
}));
