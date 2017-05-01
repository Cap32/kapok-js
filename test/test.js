
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
	const input = 'hello world';
	const kapok = new Kapok('echo', [input]);
	kapok.on('out:data', ({ ansiMessage, exit }) => {
		expect(/\\/.test(JSON.stringify(ansiMessage))).toBeTruthy();
		exit(done);
	});
});

test('should `expect()` work', (done) => {
	const input = 'hello world';
	const kapok = new Kapok('echo', [input]);
	kapok
		.expect('hello world')
		.done(done)
	;
});

test('should `expect()` work with multi lines', (done) => {
	const code = `
		console.log('hello');
		console.log('world');
	`;
	const kapok = new Kapok('node', ['-e', code]);
	kapok
		.expect('hello')
		.expect('world')
		.done(done)
	;
});

test('should `groupBy()` work', (done) => {
	const input = { a: 'hello', b: 'world' };
	const code = `
		var data = eval(${JSON.stringify(input)});
		console.log(JSON.stringify(data, null, 2));
	`;
	const kapok = new Kapok('node', ['-e', code]);
	kapok
		.groupBy(({ message }) => /\}/.test(message))
		.expect((dataset) => {
			const str = dataset.map(({ message }) => message).join('');
			const json = JSON.parse(str);
			expect(json).toEqual(input);
			return isEqual(json, input);
		})
		.done(done)
	;
});
