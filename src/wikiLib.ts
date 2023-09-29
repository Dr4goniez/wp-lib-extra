/**
 * @link https://doc.wikimedia.org/mediawiki-core/master/js/source/mediawiki.String.html#mw-String
 */
interface MwString {
	/**
	 * Calculate the byte length of a string (accounting for UTF-8).
	 * @param str
	 * @returns
	 */
	byteLength: (str: string) => number;
	/**
	 * Uppercase the first character. Support UTF-16 surrogates for characters outside of BMP.
	 * @param string 
	 * @returns 
	 */
	ucFirst: (string: string) => string;
}
// @ts-ignore
const mwString: MwString = mw.loader.require('mediawiki.String');

// **************************************************** POLLYFILLS ****************************************************

// String.prototype.includes

// Array.prototype.includes

// Array.prototype.findIndex

// Object.assign

// **************************************************** LIB OBJECT ****************************************************

const wikiLib = (() => {

// **************************************************** UTIL FUNCTIONS ****************************************************

/**
 * Load all the modules that this library depends on.
 * @returns 
 */
function load(): JQuery.Promise<void> {
	const def = $.Deferred();
	mw.loader.using([
		'mediawiki.Title',
		'mediawiki.util',
		'mediawiki.Api'
	]).then(function() {
		def.resolve();
	});
	return def.promise();
}

/**
 * Let the code sleep for n milliseconds.
 * @param milliseconds The milliseconds to sleep. If a negative number is passed, it is automatically rounded up to `0`.
 * @returns
 */
function sleep(milliseconds: number): JQuery.Promise<void> {
	const def = $.Deferred();
	setTimeout(def.resolve, Math.max(0, milliseconds));
	return def.promise();
}

interface DynamicObject {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[key: string]: any;
}
/**
 * Send an API request that automatically continues until the limit is reached. Works only for calls that have a 'continue' property in the response.
 * @param params
 * @param limit Default: 10
 * @returns The returned array might have `null` elements if any internal API request failed.
 * @requires mediawiki.Api
 */
function continuedRequest(params: DynamicObject, limit = 10): JQuery.Promise<(DynamicObject|null)[]> {

	const api = new mw.Api();
	const responses: (DynamicObject|null)[] = [];

	const query = (params: DynamicObject, count: number): JQuery.Promise<(DynamicObject|null)[]> => {
		return api.get(params)
			.then((res) => {
				responses.push(res || null);
				if (res.continue && count < limit) {
					return query(Object.assign(params, res.continue), count + 1);
				} else {
					return responses;
				}
			}).catch((_, err) => {
				console.log(`continuedRequest: Request failed (reason: ${err.error.info}, loop count: ${count}).`);
				responses.push(null);
				return responses;
			});
	};

	return query(params, 1);

}

/**
 * Send API requests with an apilimit-susceptible query parameter all at once. For instance:
 * ```
 * {
 * 	action: 'query',
 * 	titles: 'A|B|C|D|...', // This parameter is subject to the apilimit of 500 or 50
 * 	formatversion: '2'
 * }
 * ```
 * Pass the multi-value field as an array, and then this function sends multiple API requests by splicing the array in
 * accordance with the current user's apilimit (`500` for bots, `50` otherwise). It is also neccesary to pass the name
 * of the field to the second parameter of this function (if the request parameters have more than one multi-value field,
 * an array can be passed to the second parameter).
 *
 * @param params The request parameters.
 * @param batchParam
 * The name of the multi-value field (can be an array).
 * @param apilimit
 * Optional splicing number (default: `500/50`). The `**limit` parameter, if there is any, is automatically set to `max`
 * if this argument has the value of either `500` or `50`. It also accepts a unique value like `1`, in cases such as
 * {@link https://www.mediawiki.org/w/api.php?action=help&modules=query%2Bblocks |list=blocks} with a `bkip` parameter
 * (which only allows one IP to be specified).
 * @returns
 * Always an array: Elements are either `ApiResponse` (success) or `null` (failure). If the multi-value field is an empty array,
 * the return array will also be empty.
 * @requires mediawiki.Api
 */
function massRequest(params: DynamicObject, batchParams: string|string[], apilimit?: number): JQuery.Promise<(DynamicObject|null)[]> {

	// Initialize variables
	params = Object.assign({}, params);
	// @ts-ignore
	const hasApiHighLimits = [].concat(mw.config.get('wgUserGroups'), mw.config.get('wgGlobalGroups') || []).some((group) => {
		return ['sysop', 'bot', 'apihighlimits-requestor', 'global-bot', 'founder', 'staff', 'steward', 'sysadmin', 'wmf-researcher'].includes(group);
	});
	apilimit = apilimit || (hasApiHighLimits ? 500 : 50);
	const nonArrayBatchParams: string[] = [];

	// Get the array to be used for the batch operation
	const batchKeys = Array.isArray(batchParams) ? batchParams : [batchParams];
	const batchArrays = Object.keys(params).reduce((acc: string[][], key) => {
		if (batchKeys.includes(key)) {
			if (Array.isArray(params[key])) {
				acc.push(params[key].slice());
			} else {
				nonArrayBatchParams.push(key);
			}
		} else if (/limit$/.test(key) && (apilimit === 500 || apilimit === 50)) {
			// If this is a '**limit' parameter and the value is the default one, set it to 'max'
			params[key] = 'max';
		}
		return acc;
	}, []); 
	if (nonArrayBatchParams.length) {
		throw new Error('The batch param(s) (' + nonArrayBatchParams.join(', ') + ') must be arrays.');
	} else if (!batchKeys.length) {
		throw new Error('There is a problem with the value of the "batchParams" parameter.');
	} else if (!batchArrays.length) {
		throw new Error('The passed API params do not contain arrays for the batch operation.');
	} else if (batchArrays.length > 1 && !batchArrays.slice(1).every((arr) => arraysEqual(batchArrays[0], arr))) {
		throw new Error('The arrays passed for the batch operation must all be non-distinct with each other.');
	}

	// Final check
	const batchArray = batchArrays[0];
	if (!batchArray.length) {
		console.log('An empty array has been passed for the batch operation.');
		return $.Deferred().resolve([]);
	}

	// Send API requests
	const api = new mw.Api();
	const req = (reqParams: DynamicObject): JQuery.Promise<DynamicObject|null> => {
		return api.post(reqParams)
		.then((res: DynamicObject) => res || null)
		.catch((_, err) => {
			console.warn(err);
			return null;
		});
	};
	const result: JQuery.Promise<DynamicObject|null>[] = [];
	while (batchArray.length !== 0) {
		const batchArrayStr = batchArray.splice(0, apilimit).join('|');
		Object.assign( // Overwrite the batch parameters with a stringified batch array 
			params,
			batchKeys.reduce((acc: DynamicObject, key) => {
				acc[key] = batchArrayStr;
				return acc;
			}, Object.create(null))
		);
		result.push(req(params));
	}

	// eslint-disable-next-line prefer-spread
	return $.when.apply($, result).then(({...args}) => {
		const ret: (DynamicObject|null)[] = [];
		for (let i = 0; i < args.length; i++) {
			ret.push(args[i]);
		}
		return ret;
	});

}

/**
 * Remove unicode bidirectional characters and leading/trailing `\s`s from a string.
 *
 * @param str Input string.
 * @param trim Whether to trim `str`, defaulted to `true`.
 * @returns
 */
function clean(str: string, trim = true): string {
	/**
	 * The regex is adapted from {@link https://doc.wikimedia.org/mediawiki-core/master/js/source/Title.html#mw-Title |mediawiki.Title}.
	 */
	str = str.replace(/[\u200E\u200F\u202A-\u202E]+/g, '');
	return trim ? str.trim() : str;
}

/**
 * A disjunctive union type for primitive types.
 */
type primitive = string|number|bigint|boolean|null|undefined;

/**
 * Check whether two arrays are equal. Neither array should contain non-primitive values as its elements.
 * @param array1
 * @param array2
 * @param orderInsensitive Default: `false`
 * @returns
 */
function arraysEqual(array1: primitive[], array2: primitive[], orderInsensitive = false): boolean {
	if (orderInsensitive) {
		return array1.length === array2.length && array1.every(el => array2.includes(el));
	} else {
		return array1.length === array2.length && array1.every((el, i) => array2[i] === el);
	}
}

/**
 * Compare elements in two arrays and get differences.
 * @param sourceArray
 * @param targetArray
 * @returns
 */
function arraysDiff(sourceArray: primitive[], targetArray: primitive[]) {
	const added: primitive[] = [];
	const removed: primitive[] = [];
	sourceArray.forEach((el) => {
		if (!targetArray.includes(el)) removed.push(el);
	});
	targetArray.forEach((el) => {
		if (!sourceArray.includes(el)) added.push(el);
	});
	return {added, removed};
}

// **************************************************** CLASSES ****************************************************

/** The object that stores the properties of a template argument, used in `Template.args`. */
interface TemplateArgument {
	/**
	 * The argument name, from which unicode bidirectional characters and leading/trailing spaces are removed.
	 *
	 * Note that this property is never an empty string even for unnamed arguments.
	 */
	name: string;
	/**
	 * The argument value, from which unicode bidirectional characters are removed. As for leading/trailing spaces,
	 * whether they are removed depends on whether the argument is named: Unnamed arguments ignore them, while named
	 * ones don't. Note, however, that trailing linebreak characters are always removed.
	 */
	value: string;
	/**
	 * The argument's text created out of `name` and `value`, starting with a pipe character.
	 *
	 * Note that the name is not rendered for unnamed arguments.
	 */
	text: string;
	/**
	 * The unformatted argument name.
	 */
	ufname: string;
	/**
	 * The unformatted argument value.
	 */
	ufvalue: string;
	/**
	 * The argument's text created out of `ufname` and `ufvalue`, starting with a pipe character.
	 *
	 * Note that the name is not rendered for unnamed arguments.
	 */
	uftext: string;
	/**
	 * Whether the argument is named.
	 */
	unnamed: boolean;
}

interface ArgumentHierarchy {
	/**
	 * Argument hierarchies.
	 *
	 * Module-invoking templates may have nested parameters (e.g. `{{#invoke|module|user={{{1|{{{user|}}}}}}}}`).
	 * In such cases, pass `[['1', 'user'], [...]]`, and then `|1=` will be overridden by `|user=` when the
	 * `Template` already has `|1=` as an argument.
	 */
	hierarchy?: string[][];
}
/** The config object of the `Template` constructor. */
interface ConstructorConfig extends ArgumentHierarchy {
	/**
	 * Full string that should fit into the first slot of the template (`{{fullName}}`), **excluding** double braces.
	 * May contain whitespace characters (`{{ fullName }}`) and/or expressions that are not part of the template name
	 * (`{{ <!--name-->fullName }}`, `{{ {{{|safesubst:}}}fullName }}`, `{{ fullName \n}}`).
	 */
	fullName?: string;
}

/**
 * The object that is an element of the array to specify what template arguments to add/update.
 *
 * Used in `Template.addArgs` and `Template.setArgs`.
 */
interface NewArg {
	/**
	 * The name of the new argument. This can be an empty string if the class should automatically assign an integer name
	 * in accordance with the arguments that have already been registered.
	 *
	 * This property accepts leading/trailing spaces, for an output of e.g. `| 1 = value ` instead of `|1=value` (a config
	 * object must be passed to `render` for this output).
	 */
	name: string;
	/**
	 * The value of the new argument.
	 *
	 * This property accepts leading/trailing spaces, for an output of e.g. `| 1 = value ` instead of `|1=value` (a config
	 * object must be passed to `render` for this output). It can also end with `\n` when the argument should have a linebreak
	 * before the next argument or `}}` (although this should be regulated by the `linebreak` or `linebreakPredicate` option of
	 * `render`).
	 */
	value: string;
	/**
	 * Forcibly register this (integer-named) argument as unnamed. Ignored if `name` (after being formatted) is not of an integer.
	 */
	forceUnnamed?: boolean;
}

/** The option object passed to `Template.getArg` and `Template.hasArg`. */
interface GetArgOptions {
	/**
	 * Also check whether the argument with the matched name meets this condition predicate.
	 * @param arg
	 */
	conditionPredicate?: (arg: TemplateArgument) => boolean;
}

/** The option object passed to `Template.render`. */
interface RenderOptions {
	/**
	 * Use the template name of this format. See `Template.getName` for details.
	 */
	nameprop?: 'full'|'clean'|'fullclean';
	/**
	 * Whether to add `subst:` before the template name.
	 */
	subst?: boolean;
	/**
	 * For template arguments, use the unformatted counterpart(s) of `name` (i.e. `ufname`), `value` (i.e. `ufvalue`),
	 * or both, instead of the formatted ones. Note that specifying this option disables the auto-rendering of the name
	 * of an unnamed argument whose value contains a `=`.
	 */
	unformatted?: 'name'|'value'|'both';
	/**
	 * Callback function to `Array.prototype.sort`, called on the `args` array before stringifying the template arguments.
	 * @param obj1
	 * @param obj2
	 */
	sortPredicate?: (obj1: TemplateArgument, obj2: TemplateArgument) => number;
	/**
	 * Whether to break lines for each template slot. Overridden by `linebreakPredicate`.
	 * 
	 * Note that if this option is specified, all trailing `\n`s are first removed, and it is then evaluated whether to
	 * add an `\n` at the end of the slot.
	 */
	linebreak?: boolean;
	/**
	 * Put a new line in accordance with this predicate. Prioritized than `linebreak`.
	 * 
	 * Note that if this option is specified, all trailing `\n`s are first removed, and it is then evaluated whether to
	 * add an `\n` at the end of the slot.
	 */
	linebreakPredicate?: {
		/**
		 * Whether to put a new line after the first template slot for the name. `\n` is added if the callback is true.
		 * @param name The template's name in accordance with `nameprop`.
		 */
		name: (name: string) => boolean;
		/**
		 * Whether to put a new line after each template argument. `\n` is added if the callback is true.
		 * @param obj
		 */
		args: (obj: TemplateArgument) => boolean;
	};
}

/** The object returned by `Template.toJSON`. */
interface TemplateJSON {
	name: string;
	fullName: string;
	cleanName: string;
	fullCleanName: string;
	args: TemplateArgument[];
	keys: string[];
	overriddenArgs: TemplateArgument[];
	hierarchy: string[][];
}

/**
 * The `Template` class. Creates a new {{template}}.
 */
class Template {

	/**
	 * Name of the page that is to be transcluded. Should not contain anything but a page title.
	 * @readonly
	 */
	readonly name: string;
	/**
	 * Full string that fits into the first slot of the template (`{{fullName}}`). May be accompanied by additional
	 * characters that are not relevant to the title of the page to be transcluded.
	 * @readonly
	 */
	readonly fullName: string;
	/**
	 * `name` formatted by `Title.newFromText`.
	 * @readonly
	 */
	readonly cleanName: string;
	/**
	 * `cleanName` with redundancies as in `fullName`.
	 * @readonly
	 */
	readonly fullCleanName: string;
	/**
	 * The arguments of the template parsed as an array of objects.
	 * @readonly
	 */
	readonly args: TemplateArgument[];
	/**
	 * An array of the names of the template arguments.
	 * @readonly
	 */
	readonly keys: string[];
	/**
	 * The overridden arguments of the template stored as an array of objects.
	 * @readonly
	 */
	readonly overriddenArgs: TemplateArgument[];
	/**
	 * Argument hierarchies.
	 * @private
	 */
	private readonly hierarchy: string[][];

	/**
	 * Initialize a new `Template` instance.
	 *
	 * @param name Name of the page that is to be transcluded. Should not contain anything but a page title.
	 * @param config Optional initializer object.
	 * @throws {Error} When `name` has inline `\n` characters or when`config.fullName` does not contain `name` as a substring.
	 * @requires mediawiki.Title
	 * @requires mediawiki.util
	 */
	constructor(name: string, config?: ConstructorConfig) {

		const cfg = config || {};
		this.name = clean(name);
		if (this.name.includes('\n')) {
			throw new Error(`name ("${name}") is not allowed to contain inline "\\n" characters.`);
		}
		this.fullName = clean(cfg.fullName || name, false);
		this.args = [];
		this.keys = [];
		this.overriddenArgs = [];
		if (!this.fullName.includes(this.name)) {
			throw new Error(`fullName ("${this.fullName}") does not contain name ("${this.name}") as a substring.`);
		}
		this.hierarchy = cfg.hierarchy || [];

		// Truncate the leading colon, if any
		let colon = '';
		name = name.replace(/^[^\S\r\n]*:[^\S\r\n]*/, (m) => {
			colon = m;
			return '';
		});

		// Set cleanName
		const title = mw.Title.newFromText(name);
		const getConcatableFragment = (title: mw.Title): string => {
			const fragment = title.getFragment();
			return fragment ? '#' + fragment : '';
		};
		if (!title) {
			this.cleanName = colon + mwString.ucFirst(name);
		} else if (title.getNamespaceId() === 10) {
			this.cleanName = title.getMain() + getConcatableFragment(title);
		} else if (title.getNamespaceId() === 0) {
			this.cleanName = colon.trim() + title.getMain() + getConcatableFragment(title);
		} else {
			this.cleanName = title.getPrefixedDb() + getConcatableFragment(title);
		}
		this.fullCleanName = this.fullName.replace(this.name, this.cleanName);

	}

	/**
	 * Get the name of the template.
	 *
	 * @param prop By default, returns the original, unformatted `name` passed to #constructor.
	 * - If `full` is passed, returns `fullName` passed to #constructor (same as `name` if none was passed).
	 * - If `clean` is passed, returns `name` that is formatted.
	 * - If `fullclean` is passed, returns `name` that is formatted and accompanied by redundancies as in `fullName`.
	 *
	 * In specifying any of the above, the first letter is capitalized.
	 *
	 * Note that if `name` is prefixed by `Template:`, the namespace prefix is truncated in `prop=clean` and `prop=fullclean`.
	 * ```
	 * // name: Template:test
	 * const template = new Template('Template:test');
	 * console.log(template.getName()): // Template:test
	 * console.log(template.getName('full')): // Template:test
	 * console.log(template.getName('clean')): // Test
	 * console.log(template.getName('fullclean')): // Test
	 * ```
	 * For the clean names, namespace aliases are formatted to their canonical ones.
	 * ```
	 * // name: project:test', fullName: '<!--change?-->project:test
	 * const template = new Template('project:test', {fullName: '<!--change?-->project:test'});
	 * console.log(template.getName()): // project:test
	 * console.log(template.getName('full')): // <!--change?-->project:test
	 * console.log(template.getName('clean')): // Wikipedia:Test
	 * console.log(template.getName('fullclean')): // <!--change?-->Wikipedia:Test
	 * ```
	 */
	getName(prop?: 'full'|'clean'|'fullclean'): string {
		if (!prop) {
			return this.name;
		} else if (prop === 'fullclean') {
			return this.fullCleanName;
		} else if (prop === 'full') {
			return this.fullName;
		} else {
			return this.cleanName;
		}
	}

	/**
	 * Register template arguments into `Template.args`.
	 *
	 * @param newArgs An array of `{name: string; value: string;}` objects.
	 * @param logOverride Whether to leave a log when overriding argument values.
	 */
	private registerArgs(newArgs: NewArg[], logOverride: boolean) {
		newArgs.forEach(({name, value, forceUnnamed}) => {

			const ufname = name;
			const ufvalue = value;
			name = clean(name);
			const unnamed = /^\d+$/.test(name) && forceUnnamed || !name;
			if (unnamed) {
				value = clean(value, false).replace(/\n*$/, '');
			} else {
				value = clean(value);
			}
			const text = '|' + (unnamed ? '' : name + '=') + value.replace(/^\|/, '');
			const uftext = '|' + (unnamed ? '' : ufname + '=') + ufvalue.replace(/^\|/, '');

			this.registerArg(
				{name, value, text, ufname, ufvalue, uftext, unnamed},
				logOverride
			);

		});
	}

	/**
	 * @param arg New argument object to register.
	 * @param logOverride Whether to leave a log when overriding argument values.
	 */
	private registerArg(arg: TemplateArgument, logOverride: boolean) {

		// Name if unnamed
		if (arg.unnamed) {
			for (let i = 1; i < Infinity; i++) {
				if (!this.keys.includes(i.toString())) {
					arg.name = i.toString();
					break;
				}
			}
		}

		// Check duplicates
		const hier = this.getHier(arg.name);
		let oldArg: TemplateArgument|null;
		if (hier !== null) {
			const foundArg = this.args[hier.index];
			if (hier.priority === 1 && arg.value || // There's an argument of a lower priority and this argument has a non-empty value
				hier.priority === -1 && !foundArg.value || // There's an argument of a higher priority and that argument's value is empty
				hier.priority === 0 && arg.value // This argument is a duplicate and has a non-empty value
			) {
				if (logOverride) {
					this.overriddenArgs.push({...foundArg}); // Leave a log of the argument to be overidden
				}
				// Delete the formerly-registered argument and proceed to registering this argument
				this.keys.splice(hier.index, 1);
				this.args.splice(hier.index, 1);
			} else {
				// The current argument is to be overridden by a formerly-registered argument
				if (logOverride) {
					this.overriddenArgs.push({...arg}); // Leave a log of this argument
				}
				return; // Don't register this argument
			}
		} else if ((oldArg = this.getArg(arg.name))){
			if (logOverride) {
				this.overriddenArgs.push({...oldArg});
			}
			this.deleteArg(arg.name);
		}

		// Register the new argument
		this.keys.push(arg.name);
		this.args.push(arg);

	}

	/**
	 * Check whether a given argument is to be hierarchically overridden.
	 * @param name
	 */
	private getHier(name: string): {
		/** The index number of `name` or its alias in `this.keys`. */
		index: number;
		/** `1` if `name` is on a higher position than `key` is in the hierarchy, `-1` if lower, `0` if the same. */
		priority: number;
	}|null {
		let ret = null;
		if (!this.hierarchy.length || !this.keys.length) {
			return ret;
		}
		this.hierarchy.some((arr) => {

			// Does this hierarchy array contain the designated argument name?
			const prIdx = arr.indexOf(name);
			if (prIdx === -1) return false;

			// Does the Template already have an argument of the designated name or its alias?
			const prIdx2 = arr.findIndex((key) => this.keys.includes(key));
			const keyIdx = this.keys.findIndex((key) => arr.includes(key));
			if (prIdx2 === -1 || keyIdx === -1) return false;

			// The argument of either the designated name or its alias is to be overridden
			ret = {
				index: keyIdx,
				priority: prIdx2 > prIdx ? -1 : prIdx2 < prIdx ? 1 : 0
			};
			return true;

		});
		return ret;
	}

	/**
	 * Add new arguments to the `Template` instance. This method leaves a log when argument override takes place,
	 * which can be viewed by `getOverriddenArgs`.
	 *
	 * @param newArgs An array of `{name: string; value: string;}` objects.
	 */
	addArgs(newArgs: NewArg[]): Template {
		this.registerArgs(newArgs, true);
		return this;
	}

	/**
	 * Set (or update) arguments in(to) the `Template` instance. This method does not leave a log when argument override takes place.
	 *
	 * Note: New arguments are simply newly added, just as when `addArgs` is used.
	 *
	 * @param newArgs An array of `{name: string; value: string;}` objects.
	 */
	setArgs(newArgs: NewArg[]): Template {
		this.registerArgs(newArgs, false);
		return this;
	}

	/**
	 * Get the arguments of the template as an array of objects.
	 *
	 * @param deepCopy Whether to return a deep copy, defaulted to `true`. Otherwise, `Template.args` is passed by reference
	 * (not recommended).
	 * @returns
	 */
	getArgs(deepCopy = true): TemplateArgument[] {
		if (deepCopy) {
			return this.args.map(obj => ({...obj}));
		} else {
			return this.args;
		}
	}

	/**
	 * Get (a deep copy of) a template argument from an argument name.
	 * @param name Argument name.
	 * @param options Optional search options.
	 * @returns `null` if no argument is found with the specified name.
	 */
	getArg(name: string|RegExp, options?: GetArgOptions & {
		/**
		 * If true, look for the first match, instead of the last.
		 */
		findFirst?: boolean;
	}): TemplateArgument|null {

		options = options || {};

		const nameRegex = typeof name === 'string' ? new RegExp(`^${mw.util.escapeRegExp(name)}$`) : name;
		let firstMatch: TemplateArgument|null = null;
		let lastMatch: TemplateArgument|null = null;
		for (let i = 0; i < this.args.length; i++) {
			const arg = this.args[i];
			if (nameRegex.test(arg.name) && (!options.conditionPredicate || options.conditionPredicate(arg))) {
				if (!firstMatch) {
					firstMatch = arg;
				}
				lastMatch = arg;
			}
		}

		let ret = options.findFirst ? firstMatch : lastMatch;
		if (ret) ret = Object.assign({}, ret);
		return ret;

	}

	/**
	 * Check whether the `Template` instance has an argument with a certain name.
	 * @param name Name of the argument to search for.
	 * @param options Optional search options.
	 * @returns A boolean value in accordance with whether there is a match.
	 */
	hasArg(name: string|RegExp, options?: GetArgOptions): boolean {
		options = options || {};
		const nameRegex = typeof name === 'string' ? new RegExp(`^${mw.util.escapeRegExp(name)}$`) : name;
		for (let i = 0; i < this.args.length; i++) {
			const arg = this.args[i];
			if (nameRegex.test(arg.name) && (!options.conditionPredicate || options.conditionPredicate(arg))) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Delete template arguments.
	 * @param names
	 * @returns Deleted arguments.
	 */
	deleteArgs(names: string[]): TemplateArgument[] {
		return names.reduce((acc: TemplateArgument[], name) => {
			const idx = this.keys.indexOf(name);
			if (idx !== -1) {
				acc.push(this.args[idx]);
				this.keys.splice(idx, 1);
				this.args.splice(idx, 1);
			}
			return acc;
		}, []);
	}

	/**
	 * Delete a template argument.
	 * @param name
	 * @returns true if an element in the `args` existed and has been removed, or false if the element does not exist.
	 */
	deleteArg(name: string): boolean {
		let deleted = false;
		const idx = this.keys.indexOf(name);
		if (idx !== -1) {
			this.keys.splice(idx, 1);
			this.args.splice(idx, 1);
			deleted = true;
		}
		return deleted;
	}

	/**
	 * Get a list of overridden template arguments as an array of objects. This method returns a deep copy,
	 * and modifying the return value does not modify the original array stored in the class.
	 */
	getOverriddenArgs(): TemplateArgument[] {
		return this.overriddenArgs.map(obj => ({...obj}));
	}

	/**
	 * Get the argument hierarchies.
	 * @returns
	 */
	getHierarchy(): string[][] {
		return this.hierarchy.map(arr => [...arr]);
	}

	/**
	 * Render the `Template` instance as wikitext.
	 *
	 * Use `render({nameprop: 'full', unformatted: 'both'})` for an output that is closest to the original configurations.
	 *
	 * @param options Optional object of rendering specifications
	 */
	render(options?: RenderOptions): string {

		options = options || {};
		let ret = '{{';

		// Render name
		let n;
		const subst = options.subst ? 'subst:' : '';
		switch (options.nameprop) {
			case 'full':
				n = this.fullName.replace(this.name, subst + this.name);
				break;
			case 'clean':
				n = subst + this.cleanName;
				break;
			case 'fullclean':
				n = this.fullCleanName.replace(this.cleanName, subst + this.cleanName);
				break;
			default:
				n = subst + this.name;
		}
		if (options.linebreakPredicate) {
			ret += n.replace(/\n+$/, '') + (options.linebreakPredicate.name(n) ? '\n' : '');
		} else if (options.linebreak) {
			ret += n.replace(/\n+$/, '') + '\n';
		} else {
			ret += n;
		}

		// Render args
		const args = this.args.map(obj => ({...obj}));
		if (options.sortPredicate) {
			args.sort(options.sortPredicate);
		}
		for (const obj of args) {
			let text = '|';
			const name = options.unformatted === 'name' || options.unformatted === 'both' ? obj.ufname : obj.name;
			const value = options.unformatted === 'value' || options.unformatted === 'both' ? obj.ufvalue : obj.value;
			if (!obj.unnamed || !options.unformatted && value.includes('=')) {
				text += name + '=';
			}
			text += value;
			if (options.linebreakPredicate) {
				ret += text.replace(/\n+$/, '') + (options.linebreakPredicate.args(obj) ? '\n' : '');
			} else if (options.linebreak) {
				ret += text.replace(/\n+$/, '') + '\n';
			} else {
				ret += text;
			}
		}
		ret += '}}';

		return ret;

	}

	/**
	 * Stringify the `Template` instance. Same as `render({nameprop: 'full', unformatted: 'both'})`.
	 */
	toString(): string {
		return this.render({nameprop: 'full', unformatted: 'both'});
	}

	/**
	 * Get class properties in a JSON format.
	 */
	toJSON(): TemplateJSON {
		return {
			name: this.name,
			fullName: this.fullName,
			cleanName: this.cleanName,
			fullCleanName: this.fullCleanName,
			args: this.args.map(obj => ({...obj})),
			keys: this.keys.slice(),
			overriddenArgs: this.overriddenArgs.map(obj => ({...obj})),
			hierarchy: this.hierarchy.map(arr => [...arr])
		};
	}

}

return {
	load,
	sleep,
	continuedRequest,
	massRequest,
	clean,
	arraysEqual,
	arraysDiff,
	Template
};

// ********************************************************************************************************
})();

// **************************************************** EXPORTS ****************************************************
try {
	module.exports = wikiLib;
}
catch (err) {
	// Do nothing
}