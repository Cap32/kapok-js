
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

const test = (condition, message, dataset) => {
	if (isFunction(condition)) { return condition(message, dataset); }
	else if (isRegExp(condition)) { return condition.test(message); }
	return condition === message;
};

export default class Kapok extends EventEmitter {
	constructor(command, args, options) {
		super();

		this._fns = [];
		this.message = '';
		this.dataset = [];

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

					this.message = line.message;
					this.dataset.push(line);
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

	assert(condition, options) {
		const { errorMessage, action } = ensureOptions(options);
		this._fns.push(() => {
			const { message, dataset } = this;
			const matched = test(condition, message, dataset);
			if (!matched) { throw new Error(errorMessage); }
			action(message, dataset);
			dataset.length = 0;
		});
		return this;
	}

	groupUntil(condition, join = '') {
		if (isNumber(condition)) {
			condition = () => this.dataset.length === condition;
		}

		const groupFn = () => {
			const { dataset } = this;
			const isCompleted = test(condition, this.message, dataset);
			if (isCompleted) {
				if (isFunction(join)) {
					this.message = join(dataset);
				}
				else if (join !== false) {
					this.message = dataset.map(({ message }) => message).join(join);
				}
				this._next();
			}
			else {
				this._fns.unshift(groupFn);
			}
		};
		this._fns.push(groupFn);
		return this;
	}

	ignoreUntil(condition) {
		this.groupUntil(condition, false);
		return this.assert(() => true);
	}

	until(condition) {
		this.groupUntil(condition, false);
		this.dataset.length = 0;
		return this;
	}

	done(callback) {
		this._done = callback;
		return this;
	}

	_next() {
		const fn = this._fns.shift();
		if (isFunction(fn)) { fn(); }

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
		this.child.once('exit', () => done());
		this.child.once('error', () => done());
	}
}
