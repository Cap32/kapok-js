# kapok-js

Javascript Testing utilities for CLI


## Installation

```bash
yarn add -D kapok-js
```

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

const kapok = new Kapok('node', ['-e', code]);

kapok.on('data', ({ ansiMessage }) => console.log(ansiMessage));

// will log:
/*
🌺
* * *
start
{
  "hello": "world"
}
end
*/

kapok
  .ignoreUntil(/\*/) // ignore lines until the line matches `/\*/`
  .assert('start')
  .groupUntil('}') // group multi lines until the line is equal with '}', and then `join('')` the grouped lines
  .assert((message) => isEqual({ hello: 'world' }, JSON.parse(message)))
  .assert('end')
  .done(() => {
    console.log('done');
  })
;
```


## API

#### Kapok#constructor(command[, args][, options])

- `command` (String): The command to run
- `args` (Array): List of string arguments
- `options` (Object): Just like [spawn options](https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options)
- Returns (Kapok)

Spawns a new process using the given `command`, just like `child_process.spawn()`, but returns a `Kapok` instance.

A `Kapok` instance inherits with [EventEmitter](https://nodejs.org/api/events.html#events_class_eventemitter)

---

#### Kapok#assert(condition[, options])

- `condition` (String|RegExp|Function): Testing `message`, throw an error if returns `false`. The `message` is the each line data of process outputs
  + If is a `String`, it will return `message === condition`
  + If is a `RegExp`, it will return `condition.test(message)`
  + If is a `Function`, it will return `condition(message, dataset)`
    * `message` (String): Data message of each line
    * `dataset` (Array): An array of data. A data includes `message` and `ansiMessage`. `ansiMessage` is like `message`, but includes some ANSI code.
- `options` (String|Object)
  + `errorMessage` (String): If `condition` returns `false`, it will throw a new error with the message. If the `options` is a `String`, it will become a short hand of `options.errorMessage`
  + `action` (Function): An addition function to do something while `assert` function is fired
- Returns (Kapok)

Iterate each line of the process outputs, and assert the data message of each line.

###### Example

```js
const kapok = new Kapok('echo', ['a\nb\nc']);
kapok
  .assert('a') /* using `String` */
  .assert(/b/) /* using `RegExp` */
  .assert((message) => message === 'c') /* using `Function` */
;
```

---

#### Kapok#groupUntil(condition[, join])

- `condition` (Number|String|RegExp|Function): Decide when to stop grouping lines
  + If is a `Number`, it will return `true` if the delta line number is equal with `condition` number
  + If is a `String`, it will return `message === condition`
  + If is a `RegExp`, it will return `condition.test(message)`
  + If is a `Function`, it will return `condition(message, dataset)`
- `join` (String|Function|false): Decide how to combine each `messages`
  + If is a `String`, it will combine messages by `messages.join(joinString)`
  + If is a `Function`, it will combine messages by `join(dataset)`
  + If is `false`, it won't combine messages
  + By default, it is an empty string
- Returns (Kapok)

This method help us to group multi line to pass to the next `assert()`.

###### Example

```js
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
    return isEqual(json, input);
  })
  .done(done)
;
```

---

#### Kapok#until(condition)

- `condition` (Number|String|RegExp|Function): Decide when to start to assert next line
  + If is a `Number`, it will return `true` if the delta line number is equal with `condition` number
  + If is a `String`, it will return `message === condition`
  + If is a `RegExp`, it will return `condition.test(message)`
  + If is a `Function`, it will return `condition(message, dataset)`
- Returns (Kapok)

Message will not pass to the next `assert()` until `condition()` matched.

###### Example

```js
const kapok = new Kapok('echo', ['# a\n# b\nc']);
kapok.until(/^[^#]/).assert('c');
```

---

#### Kapok#ignoreUntil(condition)

- `condition` (Number|String|RegExp|Function): Decide when to stop ignoring
  + If is a `Number`, it will return `true` if the delta line number is equal with `condition` number
  + If is a `String`, it will return `message === condition`
  + If is a `RegExp`, it will return `condition.test(message)`
  + If is a `Function`, it will return `condition(message, dataset)`
- Returns (Kapok)

A little like `.until()`, but `.ignoreUntil()` will event ignore the last line of the matched `condition()`.

###### Example

```js
const kapok = new Kapok('echo', ['# a\n# b\nc']);
kapok.ignoreUntil(/^#/).assert('c');
```

---

#### Kapok#done(callback)

- `callback` (Function)
- Returns (Kapok)

Provide a callback function. It's useful while using async testing framework.

###### Example

Using [jest](http://facebook.github.io/jest/)

```js
const kapok = new Kapok('echo', ['hello']);

test('echo', (cb) => {
  kapok.assert('hello').done(cb);
});
```

---

#### Event: 'data'

- `data` (Object)
  + `message` (String): Data message
  + `ansiMessage` (String): Data message includes ANSI code

The `data` event will emitted when the `stdout` or `stderr` output data.


#### Event: 'out:data'

- `data` (Object)
  + `message` (String): Data message
  + `ansiMessage` (String): Data message includes ANSI code

The `out:data` event will emitted when the `stdout` output data.


#### Event: 'err:data'

- `data` (Object)
  + `message` (String): Data message
  + `ansiMessage` (String): Data message includes ANSI code

The `err:data` event will emitted when the `stderr` output data.


#### Event: 'line'

- `line` (Object)
  + `message` (String): Data message
  + `ansiMessage` (String): Data message includes ANSI code

The `line` event will emitted when the `stdout` or `stderr` output each lines.


#### Event: 'out:line'

- `line` (Object)
  + `message` (String): Data message
  + `ansiMessage` (String): Data message includes ANSI code

The `out:line` event will emitted when the `stdout` output each lines.


#### Event: 'err:line'

- `line` (Object)
  + `message` (String): Data message
  + `ansiMessage` (String): Data message includes ANSI code

The `err:line` event will emitted when the `stderr` output each lines.


#### Event: 'error'

The same with [child_process error event](https://nodejs.org/api/child_process.html#child_process_event_error)


#### Event: 'exit'

The same with [child_process exit event](https://nodejs.org/api/child_process.html#child_process_event_exit)


## License

MIT
