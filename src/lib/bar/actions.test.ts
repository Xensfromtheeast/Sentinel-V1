import { describe, it, expect } from 'vitest';
import { classifyFirstKey } from './actions.js';

describe('classifyFirstKey', () => {
	it('c → craving, immediate dispatch', () => {
		expect(classifyFirstKey('c')).toEqual({
			mode: 'craving',
			immediate: true,
			placeholder: ''
		});
	});

	it('t → task, immediate dispatch', () => {
		expect(classifyFirstKey('t')).toEqual({
			mode: 'task',
			immediate: true,
			placeholder: ''
		});
	});

	it('i → idea, deferred with prompt', () => {
		const result = classifyFirstKey('i');
		expect(result.mode).toBe('idea');
		expect(result.immediate).toBe(false);
		expect((result as { placeholder: string }).placeholder).toBeTruthy();
	});

	it('f → focus, deferred with prompt', () => {
		const result = classifyFirstKey('f');
		expect(result.mode).toBe('focus');
		expect(result.immediate).toBe(false);
		expect((result as { placeholder: string }).placeholder).toBeTruthy();
	});

	it('any other key → freetext fallback, deferred', () => {
		const result = classifyFirstKey('x');
		expect(result.mode).toBe('freetext');
		expect(result.immediate).toBe(false);
		expect((result as { placeholder: string }).placeholder).toBeTruthy();
	});
});
