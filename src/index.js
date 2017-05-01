
import { spawn } from 'child_process';
import EventEmitter from 'events';
import stripAnsi from 'strip-ansi';
import {
	isFunction, isRegExp, isString, isNumber, defaults, noop,
} from 'lodash';

const ensureOptions = (options = {}) => {
	if (isString(options)) {
		const errorMessage = options;
		options = { errorMessage };
	}

	return defaults(options, {
		errorMessage: 'Failed',
		action: noop,
	});
};

const test = (condition, data) => {
	if (isFunction(condition)) { return condition(data); }
	else if (isRegExp(condition)) { return condition.test(data.message); }
	return condition === data.message;
};

export default class Kapok extends EventEmitter {
	constructor(command, args, options) {
		super();

		this._fns = [];
		this.data = {};

		const child = spawn(command, args, {
			...options,
			stdio: 'pipe',
		});

		child.stdin.setEncoding('utf8');
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');

		const strip = (ansiMessage = '') => stripAnsi(ansiMessage).trim();

		const trigger = (handleLine, handleData) => (ansiMessage) => {
			const data = {
				ansiMessage,
				message: strip(ansiMessage),
				exit: ::this.exit,
			};

			handleData(data);
			this.emit('data', data);

			ansiMessage
				.split('\n')
				.map((line) => ({
					message: strip(line),
					ansiMessage: line,
				}))
				.filter(({ message }) => message)
				.forEach((line) => {
					handleLine(line);
					this.emit('line', {
						...line,
						exit: ::this.exit,
					});

					this.data = line;
					this._next();
				})
			;
		};

		child.stdout.on('data', trigger(
			(line) => this.emit('out:line', line),
			(data) => this.emit('out:data', data),
		));

		child.stderr.on('data', trigger(
			(line) => this.emit('err:line', line),
			(data) => this.emit('err:data', data),
		));

		child.on('error', (...args) => this.emit('error', ...args));
		child.on('exit', (...args) => this.emit('exit', ...args));

		this.child = child;
		this.stdin = child.stdin;
		this.stdout = child.stdout;
		this.stderr = child.stderr;
	}

	write(...args) {
		this.stdin.write(...args);
		return this;
	}

	expect(condition, options) {
		const { errorMessage, action } = ensureOptions(options);
		this._fns.push((data) => {
			const matched = test(condition, data);
			if (!matched) { throw new Error(errorMessage); }
			action(data);
		});
		return this;
	}

	groupBy(groupBy) {
		if (isNumber(groupBy)) {
			groupBy = (_, dataset) => dataset.length === groupBy;
		}

		const dataset = [];
		const groupFn = (data) => {
			dataset.push(data);
			const isCompleted = groupBy(data, dataset);
			if (isCompleted) {
				dataset.message = dataset.map(({ message }) => message).join('\n');
				this.data = dataset;
				this._next();
			}
			else {
				this._fns.unshift(groupFn);
			}
		};
		this._fns.push(groupFn);
		return this;
	}

	ignore(groupBy) {
		return this.groupBy(groupBy, () => true);
	}

	done(done) {
		this._done = done;
	}

	_next() {
		const fn = this._fns.shift();
		if (isFunction(fn)) { fn(this.data); }

		if (!this._fns.length && isFunction(this._done)) {
			this._done();
		}
	}

	exit(signal, done = () => {}) {
		if (isFunction(signal)) {
			done = signal;
			signal = 'SIGTERM';
		}
		this.child.kill(signal);
		this.child.on('exit', () => done());
	}
}
