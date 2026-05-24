import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatDuration, notifyCravingSurfed, notifyFirstCravingOfDay } from './index.js';
import { sendNotification, type Options } from '@tauri-apps/plugin-notification';

function getCallArg(): Options {
	const arg = vi.mocked(sendNotification).mock.calls[0][0];
	if (typeof arg === 'string') throw new Error('Expected Options, got string');
	return arg;
}

describe('formatDuration', () => {
	it('formats milliseconds under 1 min as seconds only', () => {
		expect(formatDuration(45_000)).toBe('45 sec');
	});

	it('formats exactly 1 minute', () => {
		expect(formatDuration(60_000)).toBe('1 min');
	});

	it('formats minutes + seconds', () => {
		expect(formatDuration(5 * 60_000 + 3_000)).toBe('5 min 3 sec');
	});

	it('formats 300_000ms as 5 min (no seconds)', () => {
		expect(formatDuration(300_000)).toBe('5 min');
	});

	it('formats zero ms as 0 sec (clock-skew guard)', () => {
		expect(formatDuration(0)).toBe('0 sec');
	});

	it('formats negative ms as 0 sec (clock-skew guard)', () => {
		expect(formatDuration(-5_000)).toBe('0 sec');
	});
});

describe('notifyCravingSurfed', () => {
	beforeEach(() => {
		vi.mocked(sendNotification).mockClear();
	});

	it('sends notification with craving-surfed title', async () => {
		await notifyCravingSurfed(300_000);
		expect(sendNotification).toHaveBeenCalledOnce();
		expect(getCallArg().title).toContain('surfed');
	});

	it('includes formatted duration in notification body', async () => {
		await notifyCravingSurfed(5 * 60_000 + 3_000);
		expect(getCallArg().body).toContain('5 min 3 sec');
	});
});

describe('notifyFirstCravingOfDay', () => {
	beforeEach(() => {
		vi.mocked(sendNotification).mockClear();
	});

	it('sends a notification with a body about the 5-minute timer', async () => {
		await notifyFirstCravingOfDay();
		expect(sendNotification).toHaveBeenCalledOnce();
		expect(getCallArg().body).toContain('5-minute');
	});
});
