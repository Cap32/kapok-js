
import { spawn } from 'child_process';
import EventEmitter from 'events';
import stripAnsi from 'strip-ansi';
import chalk from 'chalk';
import callMaybe from 'call-me-maybe';
import { isFunction, isRegExp, isString, isNumber, defaults, noop, once } from 'lodash';
import figures from 'figures';
import onExit from 'signal-exit';
import fkill from 'fkill';

const test = (condition, message, lines) => {
	if (isFunction(condition)) { return condition(message, lines); }
	else if (isRegExp(condition)) { return condition.test(message); }
	return condition === message;
};

const log = (...args) => process.stdout.write(args.concat('\n').join(' '));

const deprecated = function deprecated(oldMethod, newMethod) {
	if (!deprecated[oldMethod]) { return; }
	console.warn(
		`Method "${oldMethod}()" is deprecated. ` +
		`Please use "${newMethod}()" instead.`
	);
	deprecated[oldMethod] = true;
};

const kapoks = new Set();

export default class Kapok extends EventEmitter {
	static config = {
		shouldShowLog: true,
		shouldThrowError: false,
	};

	static start(...args) {
		return new Kapok(...args);
	}

	static async killAll() {
		return Promise.all([...kapoks].map((kapok) => kapok.kill()));
	}

	static get size() {
		return kapoks.size;
	}

	constructor(command, args = [], options) {
		super();

		this._fns = [];
		this.message = '';
		this.lines = [];
		this.errors = [];
		this._stash = [];
		this._isPending = false;
		this._performDone = noop;

		Kapok.config.shouldShowLog && log(
			chalk.dim.bold(figures.pointerSmall),
			chalk.gray(JSON.stringify([command, ...args].join(' ')).replace(/^"|"$/g, '')),
		);

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

					this._stash.push(line);
					this._requestNext();
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

		child.on('error', (...args) => {
			const err = args[0];
			if (err && err.code === 'ENOENT') {
				err.message = 'command not found: "' + command + '"';
				const spaceIdx = command.indexOf(' ');
				if (~spaceIdx) {
					err.message += ' (Did you mean to pass arguments to command `' + command.substr(0, spaceIdx) + '\'?)';
				}
			}
			this.emit('error', ...args);
		});
		child.on('exit', (...args) => this.emit('exit', ...args));

		this.child = child;
		this.stdin = child.stdin;
		this.stdout = child.stdout;
		this.stderr = child.stderr;
		this.kill = ::this.exit;

		onExit((code, signal) => {
			this.errors.push(new Error(signal));
			this.emit('signal:exit', code, signal);
			this._performDone();
		});

		kapoks.add(this);
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
				errorMessage = chalk.red(`${figures.cross} `);
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
				log(errorMessage);
				this.errors.push(error);
			}
		};

		this._fns.push(async () => {
			const { message, lines } = this;
			const matched = test(condition, message, lines);

			if (!matched) {
				throwError(new Error(message));
			}
			else if (shouldShowLog) {
				log(`${chalk.green(figures.tick)} ${chalk.gray(message)}`);
			}
			await action(message, lines, this);
			lines.length = 0;
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
			condition = () => this.lines.length === line;
		}

		const group = async () => {
			const { lines } = this;
			const isCompleted = test(condition, this.message, lines);

			if (getLogMessage) {
				const logMessage = getLogMessage(this.message, isCompleted);
				shouldShowLog && logMessage && log(logMessage);
			}

			if (isCompleted) {
				if (isFunction(join)) {
					this.message = join(lines);
				}
				else if (join !== false) {
					this.message = lines.map(({ message }) => message).join(join);
				}

				if (isFunction(action)) {
					await action(this.message, lines, this);
				}

				this._stash.unshift(this.message);
			}
			else {
				this._fns.unshift(group);
			}

			this._requestNext();
		};
		this._fns.push(group);
		this._requestNext();
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
		const getLogMessage = (message) =>
			chalk.gray(`${figures.circleDotted} ${message}`)
		;

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
		this.lines.length = 0;
		return this;
	}

	assertUntil(condition, options = {}) {
		const { shouldShowLog } = options;
		this.until(condition, { shouldShowLog });
		return this.assert(condition, options);
	}

	_done(shouldKill, callback) {
		return callMaybe(callback, new Promise((resolve, reject) => {
			this._performDone = once(async () => {
				const { errors } = this;
				if (shouldKill) {
					await this.kill().catch(noop);
				}
				if (errors.length) {
					reject(errors);
				}
				else { resolve(this); }
			});
		}));
	}

	done(callback) {
		return this._done(false, callback);
	}

	doneAndKill(callback) {
		return this._done(true, callback);
	}

	_requestNext() {
		if (this._isPending) { return; }
		this._next();
	}

	async _next() {
		if (!this._stash.length) { return; }

		const lineOrMessage = this._stash.shift();
		const line = !isString(lineOrMessage) && lineOrMessage;
		this.message = line ? line.message : lineOrMessage;
		if (line) { this.lines.push(line); }

		const fn = this._fns.shift();

		this._isPending = true;
		try {
			if (isFunction(fn)) {
				await fn();
			}
		}
		catch (err) {
			this.errors.push(err);
		}
		this._isPending = false;

		if (!this._fns.length) {
			this._performDone();
		}
		else {
			await this._next();
		}
	}

	exit(signal, callback) {
		if (isString(signal)) {
			console.warn(
				'[KAPOK]: exit(signal) has been deprecated, please use exit() instead',
			);
		}

		if (isFunction(signal)) {
			callback = signal;
		}

		kapoks.delete(this);

		return callMaybe(callback, fkill(this.child.pid).catch(noop));
	}
}
