// This file just contains comments to be added to the top of the transpiled version of wikilib
// and a dummy export to be imported from other files so that they are recognized as modules.
export {};

// What to do before/after `npm run build`

// 1. Comment out `export {};` at the bottom of src/wikilib.ts

// 2. `npm run build`

// 3. Un-comment out `export {};` at the bottom of src/wikilib.ts

/**
 *	4. Comment out the following in dist/wikilib.d.ts
 *	- interface MwString
 *	- declare const mwString
 */

// 5. Add the following to the bottom of dist/wikilib.d.ts

/** The object exported by `wikilib`. */
// interface WikiLib {
// 	load: typeof load;
// 	sleep: typeof sleep;
// 	continuedRequest: typeof continuedRequest;
// 	massRequest: typeof massRequest;
// 	clean: typeof clean;
// 	arraysEqual: typeof arraysEqual;
// 	arraysDiff: typeof arraysDiff;
// 	Template: typeof Template;
// 	Wikitext: typeof Wikitext;
// }
// export {};

// (Add the following to the top of MediaWiki:Gadget-wikilib.js)
/**
 * This gadget is transpiled from TypeScript. You can find the source code at
 * @link https://github.com/Dr4goniez/wikilib/blob/main/src/wikilib.ts
 * and an API documentation at
 * @link https://dr4goniez.github.io/wikilib/index.html
 * @author [[User:Dragoniez]]
 * @license CC-BY-SA-4.0
 */