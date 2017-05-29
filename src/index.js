
import { spawn } from 'child_process';
import EventEmitter from 'events';
import stripAnsi from 'strip-ansi';
import chalk from 'chalk';
import callMaybe from 'call-me-maybe';
import { isFunction, isRegExp, isString, isNumber, defaults, noop, once } from 'lodash';

const test = (condition, message, dataset) => {
	if (isFunction(condition)) { return condition(message, dataset); }
	else if (isRegExp(condition)) { return condition.test(message); }
	return condition === message;
};

const deprecated = function deprecated(oldMethod, newMethod) {
	if (!deprecated[oldMethod]) { return; }
	console.warn(
		`Method "${oldMethod}()" is deprecated. ` +
		`Please use "${newMethod}()" instead.`
	);
	deprecated[oldMethod] = true;
};

export default class Kapok extends EventEmitter {
	static config = {
		shouldShowLog: true,
		shouldThrowError: false,
	};

	constructor(command, args, options) {
		super();

		this._fns = [];
		this.message = '';
		this.dataset = [];
		this.errors = [];

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

		const ensureOptions = (options = {}) => {
			if (isString(options)) {
				const errorMessage = options;
				options = { errorMessage };
			}

			return defaults(options, {
				action: noop,
				...Kapok.config,
			});
		};

		const {
			action, shouldShowLog, shouldThrowError, ...other,
		} = ensureOptions(options);

		const throwError = (error) => {
			const { message } = error;
			let { errorMessage } = other;

			if (isFunction(errorMessage)) {
				errorMessage = errorMessage(message, condition);
			}

			if (!isString(errorMessage)) {
				errorMessage = chalk.red('AssertionError: ');
				if (isString(condition)) {

					// eslint-disable-next-line
					errorMessage += `Expected value to be "${chalk.green(condition)}", but received "${chalk.red(message)}".`;

				}
				else {
					errorMessage += `Message is "${message}"`;
				}
			}

			error.message = errorMessage;

			if (shouldThrowError) { throw error; }
			else {
				console.log(errorMessage);
				this.errors.push(error);
			}
		};

		this._fns.push(() => {
			const { message, dataset } = this;
			const matched = test(condition, message, dataset);
			if (!matched) {
				throwError(new Error(message));
			}
			else if (shouldShowLog) {
				console.log(`${chalk.green('✓')} ${chalk.gray(message)}`);
			}
			action(message, dataset);
			dataset.length = 0;
		});
		return this;
	}

	_group(condition, options = {}) {
		const {
			shouldShowLog = Kapok.config.shouldShowLog,
			getLogMessage,
			join,
			action,
		} = options;

		if (isNumber(condition)) {
			const line = condition;
			condition = () => this.dataset.length === line;
		}

		const group = () => {
			const { dataset } = this;
			const isCompleted = test(condition, this.message, dataset);

			if (getLogMessage) {
				const logMessage = getLogMessage(this.message, isCompleted);
				shouldShowLog && logMessage && console.log(logMessage);
			}

			if (isCompleted) {
				if (isFunction(join)) {
					this.message = join(dataset);
				}
				else if (join !== false) {
					this.message = dataset.map(({ message }) => message).join(join);
				}

				if (isFunction(action)) {
					action(this.message, dataset);
				}
				this._next();
			}
			else {
				this._fns.unshift(group);
			}
		};
		this._fns.push(group);
		return this;
	}

	groupUntil(condition, join = '') {
		deprecated('groupUntil', 'joinUntil');
		return this._group(condition, { join });
	}

	joinUntil(condition, options) {
		const getLogMessage = (message) => chalk.gray(`+ ${message}`);
		return this._group(condition, {
			join: '',
			...options,
			getLogMessage,
		});
	}

	ignoreUntil(condition, options) {
		const getLogMessage = (message) => chalk.gray(`- ${message}`);
		this._group(condition, {
			...options,
			join: false,
			getLogMessage,
		});
		return this.assert(() => true, { shouldShowLog: false });
	}

	until(condition, options) {
		const getLogMessage = (message, isCompleted) => {
			if (!isCompleted) { return chalk.gray(`- ${message}`); }
		};
		this._group(condition, {
			...options,
			join: false,
			getLogMessage,
		});
		this.dataset.length = 0;
		return this;
	}

	assertUntil(condition, options = {}) {
		const { shouldShowLog } = options;
		this.until(condition, { shouldShowLog });
		return this.assert(condition, options);
	}

	done(callback) {
		return callMaybe(callback, new Promise((resolve, reject) => {
			this._done = once(() => {
				const { errors } = this;
				if (errors.length) {
					reject(errors);
				}
				else { resolve(); }
			});
		}));

		// this._done = once(() => {
		// 	const { errors } = this;
		// 	if (errors.length) {
		// 		callback(errors);
		// 	}
		// 	else { callback(); }
		// });
		// return this;
	}

	_next() {
		const fn = this._fns.shift();
		if (isFunction(fn)) { fn(); }

		if (!this._fns.length && isFunction(this._done)) {
			this._done();
		}
	}

	exit(signal, done = noop) {
		if (isFunction(signal)) {
			done = signal;
			signal = 'SIGTERM';
		}
		this.child.kill(signal);
		this.child.once('close', done);
	}
}
