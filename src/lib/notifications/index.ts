import { sendNotification } from '@tauri-apps/plugin-notification';

/** Format milliseconds as a human-readable duration string (e.g. "5 min 3 sec"). */
export function formatDuration(ms: number): string {
	if (ms <= 0) return '0 sec';
	const totalSec = Math.round(ms / 1000);
	const min = Math.floor(totalSec / 60);
	const sec = totalSec % 60;
	if (min > 0 && sec > 0) return `${min} min ${sec} sec`;
	if (min > 0) return `${min} min`;
	return `${sec} sec`;
}

/**
 * Fire a native OS notification congratulating the user on surfing a craving.
 * Called after craving_resolved { outcome: 'surfed' } is appended.
 */
export async function notifyCravingSurfed(duration_ms: number): Promise<void> {
	const duration = formatDuration(duration_ms);
	await sendNotification({
		title: 'Craving surfed 🌊',
		body: `You rode it out in ${duration}. That one didn't win.`
	});
}

/**
 * Fire a native OS notification when the first craving of the day is logged.
 * Callers are responsible for checking whether this is the first craving.
 */
export async function notifyFirstCravingOfDay(): Promise<void> {
	await sendNotification({
		title: 'First craving logged today',
		body: 'Start the 5-minute timer. You can do this.'
	});
}
