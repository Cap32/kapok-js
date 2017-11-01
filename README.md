# kapok-js

[![Build Status](https://travis-ci.org/Cap32/kapok-js.svg?branch=master)](https://travis-ci.org/Cap32/kapok-js) [![CircleCI](https://circleci.com/gh/Cap32/kapok-js.svg?style=svg)](https://circleci.com/gh/Cap32/kapok-js)

Javascript Testing utilities for CLI


## Table of Contents

<!-- MarkdownTOC autolink="true" bracket="round" -->

- [Installation](#installation)
- [Usage](#usage)
- [API](#api)
  - [Kapok.config](#kapokconfig)
  - [Kapok.start\(command\[, args\]\[, options\]\)](#kapokstartcommand-args-options)
  - [Kapok.size](#kapoksize)
  - [Kapok.killAll\(\)](#kapokkillall)
  - [Kapok#constructor\(command\[, args\]\[, options\]\)](#kapokconstructorcommand-args-options)
  - [Kapok#assert\(condition\[, options\]\)](#kapokassertcondition-options)
  - [Kapok#joinUntil\(condition\[, options\]\)](#kapokjoinuntilcondition-options)
  - [Kapok#until\(condition\[, options\]\)](#kapokuntilcondition-options)
  - [Kapok#assertUntil\(condition\[, options\]\)](#kapokassertuntilcondition-options)
  - [Kapok#ignoreUntil\(condition\[, options\]\)](#kapokignoreuntilcondition-options)
  - [Kapok#done\(\[callback\]\)](#kapokdonecallback)
  - [Kapok#kill\(\[signal, callback\]\)](#kapokkillsignal-callback)
  - [Event: 'data'](#event-data)
  - [Event: 'out:data'](#event-outdata)
  - [Event: 'err:data'](#event-errdata)
  - [Event: 'line'](#event-line)
  - [Event: 'out:line'](#event-outline)
  - [Event: 'err:line'](#event-errline)
  - [Event: 'error'](#event-error)
  - [Event: 'exit'](#event-exit)
  - [Event: 'signal:exit'](#event-signalexit)
- [License](#license)

<!-- /MarkdownTOC -->


<a name="installation"></a>
## Installation

```bash
yarn add -D kapok-js
```

<a name="usage"></a>
## Usage

```js
import Kapok from 'kapok-js';

const kapok = new Kapok('echo', ['hello\nworld']);
kapok.assert('hello').assert('world');
```

##### Advanced Usage

```js
import Kapok from 'kapok-js';
import { isEqual } from 'lodash';

const code = `
  console.log('🌺');
  console.log('* * *');
  console.log('start');
  console.log(JSON.stringify({ hello: 'world' }, null, 2));
  console.log('end');
`;

/*
🌺
* * *
start
{
  "hello": "world"
}
end
*/

const kapok = new Kapok('node', ['-e', code]); /* just like childProcess.spawn() */
kapok
  .ignoreUntil(/\*/) /* ignore lines until the line matches "*" */
  .assert('start')
  .joinUntil('}') /* join multi lines until the line is equal to '}', and then join the lines into a string */
  .assert((message) => isEqual({ hello: 'world' }, JSON.parse(message)))
  .assert('end')
  .done(() => {
    console.log('done');
  })
;
```


<a name="api"></a>
## API

<a name="kapokconfig"></a>
#### Kapok.config

- `config.shouldShowLog` \<Boolean\>: Show log message or not. Defaults to `true`
- `config.shouldThrowError` \<Boolean\>: Throw a new Error or not when assert fails. Defaults to `false`
- `shouldKillOnDone` \<Boolean\>: Kill kapok proceee on `done`. Defaults to `false`

A global config to all `Kapok` instances. Can be override.

---


<a name="kapokstartcommand-args-options"></a>
#### Kapok.start(command[, args][, options])

- `command` \<String\>: The command to run
- `args` \<Array\>: List of string arguments
- `options` \<Object\>: Just like [spawn options](https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options)
- Returns \<Kapok\>

Spawns a new process using the given `command`, just like `child_process.spawn()`, but returns a `Kapok` instance.

`Kapok` inherits [EventEmitter](https://nodejs.org/api/events.html#events_class_eventemitter)


---

<a name="kapoksize"></a>
#### Kapok.size

- Returns \<Number\>

Get existing kapok instances size


---

<a name="kapokkillall"></a>
#### Kapok.killAll()

- Return \<Promise\>

Kill all existing kapok instances


---

<a name="kapokconstructorcommand-args-options"></a>
#### Kapok#constructor(command[, args][, options])

The same with `Kapok.start()`


---

<a name="kapokassertcondition-options"></a>
#### Kapok#assert(condition[, options])

- `condition` \<String|RegExp|Function\>: Testing `message`, throw an error if returns `false`. The `message` is the each line data of process outputs
  + If is a `String`, it will return `message === condition`
  + If is a `RegExp`, it will return `condition.test(message)`
  + If is a `Function`, it will return `condition(message, lines)`
    * `message` \<String\>: Data message of each line
    * `lines` \<Array\>: An array of data. A data includes `message` and `ansiMessage`. `ansiMessage` is like `message`, but includes some ANSI code.
- `options` <String|Object>
  + `errorMessage` \<String\>: If `condition` returns `false`, it will throw a new error with the message. If the `options` is a `String`, it will become a short hand of `options.errorMessage`
  + `action` \<Function\>: An addition function to do something while `assert` function fires. Support returning a promise for async action
  + `shouldShowLog` \<Boolean\>: Show log message or not. Defaults to `Kapok.config.shouldShowLog`
  + `shouldThrowError` \<Boolean\>: Throw a new Error or not when assert fails. Defaults to `Kapok.config.shouldThrowError`
- Returns \<Kapok\>

Iterate each line of the process outputs, and assert the data message of each line.

###### Example

```js
const kapok = new Kapok('echo', ['a\nb\nc']);
kapok
  .assert('a') /* using `String` */
  .assert(/b/) /* using `RegExp` */
  .assert((message) => message === 'c') /* using `Function` */
  .done()
;
```

---

<a name="kapokjoinuntilcondition-options"></a>
#### Kapok#joinUntil(condition[, options])

- `condition` \<Number|String|RegExp|Function\>: Decide when to stop grouping lines
  + If is a `Number`, it will return `true` if the delta line number is equal with `condition` number
  + If is a `String`, it will return `message === condition`
  + If is a `RegExp`, it will return `condition.test(message)`
  + If is a `Function`, it will return `condition(message, lines)`
- `options` \<Object\>
  + `join` <String|Function|false>: Join the grouped `messages` into a string
    * If is a `String`, it will join messages by `messages.join(joinString)`
    * If is a `Function`, it will join messages by `join(lines)`
    * If is `false`, it won't join messages
    * By default, it is an empty string
  + `action` \<Function\>: An addition function to do something while condition matched. Support returning a promise for async action
  + `shouldShowLog` \<Boolean\>: Show log message or not. Defaults to `Kapok.config.shouldShowLog`
- Returns \<Kapok\>

A helper function to join multi lines into a string and pass to the next `assert()`. Joining function will stop when `condition()` matched.

###### Example

```js
const input = { a: 'hello', b: 'world' };
const code = `
  var data = eval(${JSON.stringify(input)});
  console.log(JSON.stringify(data, null, 2));
`;
const kapok = new Kapok('node', ['-e', code]);
kapok
  .joinUntil('}')
  .assert((message) => {
    const json = JSON.parse(message);
    return isEqual(json, input);
  })
  .done()
;
```

---

<a name="kapokuntilcondition-options"></a>
#### Kapok#until(condition[, options])

- `condition` \<Number|String|RegExp|Function\>: Decide when to start to assert next line
  + If is a `Number`, it will return `true` if the delta line number is equal with `condition` number
  + If is a `String`, it will return `message === condition`
  + If is a `RegExp`, it will return `condition.test(message)`
  + If is a `Function`, it will return `condition(message, lines)`
- `options` \<Object\>
  + `action` \<Function\>: An addition function to do something while condition matched. Support returning a promise for async action
  + `shouldShowLog` \<Boolean\>: Show log message or not. Defaults to `Kapok.config.shouldShowLog`
- Returns \<Kapok\>

Message will not pass to the next `assert()` until `condition()` matched.

###### Example

```js
const kapok = new Kapok('echo', ['# a\n# b\nc']);
kapok.until(/^[^#]/).assert('c').done(); /* lines before 'c' would be ignored */
```

---

<a name="kapokassertuntilcondition-options"></a>
#### Kapok#assertUntil(condition[, options])

- `condition` \<Number|String|RegExp|Function\>: Decide when to start to assert
  + If is a `Number`, it will return `true` if the delta line number is equal with `condition` number
  + If is a `String`, it will return `message === condition`
  + If is a `RegExp`, it will return `condition.test(message)`
  + If is a `Function`, it will return `condition(message, lines)`
- `options` \<Object\>
  + `action` \<Function\>: An addition function to do something while condition matched. Support returning a promise for async action
  + `shouldShowLog` \<Boolean\>: Show log message or not. Defaults to `Kapok.config.shouldShowLog`
- Returns \<Kapok\>

Message will not pass to the next `assert()` until `condition()` matched.

###### Example

```js
const kapok = new Kapok('echo', ['# a\n# b\nc']);
kapok.assertUntil('c').done(); /* lines before 'c' would be ignored */
```

---

<a name="kapokignoreuntilcondition-options"></a>
#### Kapok#ignoreUntil(condition[, options])

- `condition` \<Number|String|RegExp|Function\>: Decide when to stop ignoring
  + If is a `Number`, it will return `true` if the delta line number is equal with `condition` number
  + If is a `String`, it will return `message === condition`
  + If is a `RegExp`, it will return `condition.test(message)`
  + If is a `Function`, it will return `condition(message, lines)`
- `options` \<Object\>
  + `action` \<Function\>: An addition function to do something while condition matched. Support returning a promise for async action
  + `shouldShowLog` \<Boolean\>: Show log message or not. Defaults to `Kapok.config.shouldShowLog`
- Returns \<Kapok\>

A little like `.until()`, but `.ignoreUntil()` will event ignore the last line of the matched `condition()`.

###### Example

```js
const kapok = new Kapok('echo', ['# a\n# b\nc']);
kapok.ignoreUntil(/^#/).assert('c'); /* lines before 'c' would be ignored */
```

---

<a name="kapokdonecallback"></a>
#### Kapok#done([callback])

- `callback` \<Function\>: Provide a callback function. If there's no error, the first argument is `undefined`, otherwise, the first argument is an array of errors
- Returns \<Promise\>

Stop asserting. Could provide a callback function or return a promise for async function.

###### Example

Using [jest](http://facebook.github.io/jest/)

```js
const kapok = new Kapok('echo', ['hello']);

test('echo', async () => kapok.assert('hello').done());
```

---

<a name="kapokkillsignal-callback"></a>
#### Kapok#kill([signal, callback])

- `callback` \<Function\>: Provide a callback function.
- Returns \<Promise\>

Killing kapok process. Could provide a callback function or return a promise for async function.

---

<a name="event-data"></a>
#### Event: 'data'

- `data` \<Object\>
  + `message` \<String\>: Data message
  + `ansiMessage` \<String\>: Data message includes ANSI code

The `data` event will emitted when the `stdout` or `stderr` output data.


<a name="event-outdata"></a>
#### Event: 'out:data'

- `data` \<Object\>
  + `message` \<String\>: Data message
  + `ansiMessage` \<String\>: Data message includes ANSI code

The `out:data` event will emitted when the `stdout` output data.


<a name="event-errdata"></a>
#### Event: 'err:data'

- `data` \<Object\>
  + `message` \<String\>: Data message
  + `ansiMessage` \<String\>: Data message includes ANSI code

The `err:data` event will emitted when the `stderr` output data.


<a name="event-line"></a>
#### Event: 'line'

- `line` \<Object\>
  + `message` \<String\>: Data message
  + `ansiMessage` \<String\>: Data message includes ANSI code

The `line` event will emitted when the `stdout` or `stderr` output each lines.


<a name="event-outline"></a>
#### Event: 'out:line'

- `line` \<Object\>
  + `message` \<String\>: Data message
  + `ansiMessage` \<String\>: Data message includes ANSI code

The `out:line` event will emitted when the `stdout` output each lines.


<a name="event-errline"></a>
#### Event: 'err:line'

- `line` \<Object\>
  + `message` \<String\>: Data message
  + `ansiMessage` \<String\>: Data message includes ANSI code

The `err:line` event will emitted when the `stderr` output each lines.


<a name="event-error"></a>
#### Event: 'error'

The same with [child_process error event](https://nodejs.org/api/child_process.html#child_process_event_error)


<a name="event-exit"></a>
#### Event: 'exit'

The same with [child_process exit event](https://nodejs.org/api/child_process.html#child_process_event_exit)


<a name="event-signalexit"></a>
#### Event: 'signal:exit'

- `code` \<String\>: Exit code
- `signal` \<String\>: Signal

The `signal:exit` event will emitted when receive `SIG*` exit event.


<a name="license"></a>
## License

MIT
