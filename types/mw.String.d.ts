declare global {
	/**
	 * Type definitions for the methods of {@link https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.String | mw.String}.
	 *
	 * Note that the relevant object is not part of `WpLibExtra` (the interface is available in the npm package).
	 */
	interface MwString {
		/**
		 * Calculate the byte length of a string (accounting for UTF-8).
		 * @param str
		 * @returns
		 */
		byteLength(str: string): number;
		/**
		 * Calculate the character length of a string (accounting for UTF-16 surrogates).
		 * @param str
		 * @returns
		 */
		codePointLength(str: string): number;
		/**
		 * Like String#charAt, but return the pair of UTF-16 surrogates for characters outside of BMP.
		 * @param string
		 * @param offset Offset to extract the character.
		 * @param backwards Use backwards direction to detect UTF-16 surrogates, defaults to false.
		 * @returns
		 */
		charAt(string: string, offset: number, backwards?: boolean): string;
		/**
		 * Lowercase the first character. Support UTF-16 surrogates for characters outside of BMP.
		 * @param string
		 * @returns
		 */
		lcFirst(string: string): string;
		/**
		 * Uppercase the first character. Support UTF-16 surrogates for characters outside of BMP.
		 * @param string
		 * @returns
		 */
		ucFirst(string: string): string;
		/**
		 * Utility function to trim down a string, based on `byteLimit` and given a safe start position.
		 * It supports insertion anywhere in the string, so "foo" to "fobaro" if limit is 4 will result in "fobo",
		 * not "foba". Basically emulating the native maxlength by reconstructing where the insertion occurred.
		 *
		 * @param safeVal Known value that was previously returned by this function, if none, pass empty string.
		 * @param newVal New value that may have to be trimmed down.
		 * @param byteLimit Number of bytes the value may be in size.
		 * @param filterFunction Function to call on the string before assessing the length.
		 * @returns
		 */
		trimByteLength(safeVal: string, newVal: string, byteLimit: number, filterFunction?: (val: string) => number): {
			newVal: string;
			trimmed: boolean;
		};
		/**
		 * Utility function to trim down a string, based on `codePointLimit` and given a safe start position.
		 * It supports insertion anywhere in the string, so "foo" to "fobaro" if limit is 4 will result in "fobo",
		 * not "foba". Basically emulating the native maxlength by reconstructing where the insertion occurred.
		 *
		 * @param safeVal Known value that was previously returned by this function, if none, pass empty string.
		 * @param newVal New value that may have to be trimmed down.
		 * @param codePointLimit Number of characters the value may be in size.
		 * @param filterFunction Function to call on the string before assessing the length.
		 * @returns
		 */
		trimCodePointLength(safeVal: string, newVal: string, codePointLimit: number, filterFunction?: (val: string) => number): {
			newVal: string;
			trimmed: boolean;
		};
	}
}
export {};