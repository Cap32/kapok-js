
import Kapok from '../src';
import { isEqual } from 'lodash';

Kapok.config.shouldShowLog = false;
// Kapok.config.shouldShowLog = true;

test('should receive message on `out:data` event', (done) => {
	const input = 'hello world';
	const kapok = new Kapok('echo', [input]);
	kapok.on('out:data', ({ message, exit }) => {
		expect(message).toBe(input);
		exit(done);
	});
});

test('should receive ansiMessage on `out:data` event', (done) => {
	const input = '\u001b[31mhello world\u001b[39m';
	const kapok = new Kapok('echo', [input]);
	kapok.on('out:data', ({ ansiMessage, exit }) => {
		expect(/\\/.test(JSON.stringify(ansiMessage))).toBeTruthy();
		exit(done);
	});
});

test('`assert()`', (done) => {
	const input = 'hello world';
	const kapok = new Kapok('echo', [input]);
	kapok
		.assert('hello world')
		.done((err) => {
			if (err) { done.fail(err); }
			else { done(); }
		})
	;
});

test('done with promise', () => {
	const code = `
		setTimeout(() => console.log('async'), 1000);
	`;
	const kapok = new Kapok('node', ['-e', code]);
	return kapok.assert('async').done();
});

test('chaining `assert()`', () => {
	const code = `
		console.log('hello');
		console.log('world');
	`;
	return new Kapok('node', ['-e', code])
		.assert('hello')
		.assert('world')
		.done()
	;
});

test('action', async () => {
	const code = `
		console.log('hello');
		console.log('world');
	`;
	const action = jest.fn();
	await new Kapok('node', ['-e', code])
		.assert('hello', { action })
		.assert('world', { action })
		.done()
	;
	expect(action.mock.calls.length).toBe(2);
});

test('async action', async () => {
	const delay = 1000;
	let t0 = 0;
	let t1 = 0;
	const code = `
		console.log('hello');
		console.log('world');
	`;
	await new Kapok('node', ['-e', code])
		.assert('hello', {
			action() {
				t0 = Date.now();
			}
		})
		.assert('world', {
			async action() {
				return new Promise((resolve) => {
					setTimeout(() => {
						t1 = Date.now();
						resolve();
					}, delay);
				});
			}
		})
		.done()
	;
	expect(t1 - t0 >= delay).toBe(true);
});

test('`groupUntil()`', () => {
	const input = { a: 'hello', b: 'world' };
	const code = `
		var data = eval(${JSON.stringify(input)});
		console.log(JSON.stringify(data, null, 2));
	`;
	return new Kapok('node', ['-e', code])
		.groupUntil('}')
		.assert((message) => {
			const json = JSON.parse(message);
			expect(json).toEqual(input);
			return isEqual(json, input);
		})
		.done()
	;
});

test('`joinUntil()`', () => {
	const input = { a: 'hello', b: 'world' };
	const code = `
		var data = eval(${JSON.stringify(input)});
		console.log(JSON.stringify(data, null, 2));
	`;
	return new Kapok('node', ['-e', code])
		.joinUntil('}')
		.assert((message) => {
			const json = JSON.parse(message);
			expect(json).toEqual(input);
			return isEqual(json, input);
		})
		.done()
	;
});

test('`ignoreUntil()`', () => {
	const code = `
		console.log('hello');
		console.log('world');
		console.log('!');
	`;
	return new Kapok('node', ['-e', code])
		.ignoreUntil('world')
		.assert('!')
		.done()
	;
});

test('`ignoreUntil()` with lines', () => {
	const code = `
		console.log('1');
		console.log('2');
		console.log('3');
	`;
	return new Kapok('node', ['-e', code])
		.ignoreUntil(2)
		.assert('3')
		.done()
	;
});

test('`ignoreUntil()` multi times', () => {
	const code = `
		console.log('*');
		console.log('1');
		console.log('2');
		console.log('3');
	`;
	return new Kapok('node', ['-e', code])
		.ignoreUntil('*')
		.ignoreUntil(2)
		.assert('3')
		.done()
	;
});

test('`until()`', () => {
	const code = `
		console.log('hello');
		console.log('world');
		console.log('!');
	`;
	return new Kapok('node', ['-e', code])
		.until('!')
		.assert('!')
		.done()
	;
});

test('`assertUntil()`', () => {
	const code = `
		console.log('hello');
		console.log('world');
		console.log('!');
	`;
	return new Kapok('node', ['-e', code])
		.assertUntil('!')
		.done()
	;
});

test('`done()` should emit once', (done) => {
	const cb = jest.fn();
	const code = `
		console.log('hello');
		console.log('world');
		console.log('!');
	`;
	const kapok = new Kapok('node', ['-e', code]);
	kapok.done(cb);
	kapok.done(cb);
	kapok.done(cb);
	setTimeout(() => {
		try {
			expect(cb.mock.calls.length).toBe(1);
			done();
		}
		catch (err) {
			done.fail(err);
		}
	}, 2000);
});

test('should throw Error if assert fails', (done) => {
	const kapok = new Kapok('echo', ['a']);
	kapok
		.assert('b')
		.done((err) => {
			expect(err.length).toBe(1);
			done();
		})
	;
});
