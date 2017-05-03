
import Kapok from '../src';
import { isEqual } from 'lodash';

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
		.done(done)
	;
});

test('chaining `assert()`', (done) => {
	const code = `
		console.log('hello');
		console.log('world');
	`;
	const kapok = new Kapok('node', ['-e', code]);
	kapok
		.assert('hello')
		.assert('world')
		.done(done)
	;
});

test('`groupUntil()`', (done) => {
	const input = { a: 'hello', b: 'world' };
	const code = `
		var data = eval(${JSON.stringify(input)});
		console.log(JSON.stringify(data, null, 2));
	`;
	const kapok = new Kapok('node', ['-e', code]);
	kapok
		.groupUntil('}')
		.assert((message) => {
			const json = JSON.parse(message);
			expect(json).toEqual(input);
			return isEqual(json, input);
		})
		.done(done)
	;
});

test('`ignoreUntil()`', (done) => {
	const code = `
		console.log('hello');
		console.log('world');
		console.log('!');
	`;
	const kapok = new Kapok('node', ['-e', code]);
	kapok
		.ignoreUntil('world')
		.assert('!')
		.done(done)
	;
});

test('`until()`', (done) => {
	const code = `
		console.log('hello');
		console.log('world');
		console.log('!');
	`;
	const kapok = new Kapok('node', ['-e', code]);
	kapok
		.until('!')
		.assert('!')
		.done(done)
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
	kapok
		.done(cb)
		.done(cb)
		.done(cb)
	;
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
