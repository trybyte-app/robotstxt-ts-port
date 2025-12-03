// Copyright 2024 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { K_HEX_DIGITS } from "./constants.js";

/**
 * Extracts path (with params) and query part from URL. Removes scheme,
 * authority, and fragment. Result always starts with "/".
 * Returns "/" if the url doesn't have a path or is not valid.
 *
 * @param url - The URL to extract path from
 * @returns The path portion of the URL, always starting with "/"
 */
export function getPathParamsQuery(url: string): string {
	// Initial two slashes are ignored.
	let searchStart = 0;
	if (url.length >= 2 && url[0] === "/" && url[1] === "/") {
		searchStart = 2;
	}

	// Find first path character (/, ?, ;)
	const searchPart = url.slice(searchStart);
	let earlyPath = -1;
	for (let i = 0; i < searchPart.length; i++) {
		const ch = searchPart[i];
		if (ch === "/" || ch === "?" || ch === ";") {
			earlyPath = searchStart + i;
			break;
		}
	}

	// Find "://" protocol separator
	let protocolEnd = url.indexOf("://", searchStart);

	if (earlyPath !== -1 && earlyPath < protocolEnd) {
		// If path, param or query starts before ://, :// doesn't indicate protocol.
		protocolEnd = -1;
	}

	if (protocolEnd === -1) {
		protocolEnd = searchStart;
	} else {
		protocolEnd += 3;
	}

	// Find path start after protocol
	let pathStart = -1;
	for (let i = protocolEnd; i < url.length; i++) {
		const ch = url[i];
		if (ch === "/" || ch === "?" || ch === ";") {
			pathStart = i;
			break;
		}
	}

	if (pathStart !== -1) {
		// Check for fragment before path
		const hashPos = url.indexOf("#", searchStart);
		if (hashPos !== -1 && hashPos < pathStart) {
			return "/";
		}

		// Determine path end (stop at fragment)
		const pathEnd = hashPos === -1 ? url.length : hashPos;

		if (url[pathStart] !== "/") {
			// Prepend a slash if the result would start e.g. with '?'.
			return "/" + url.slice(pathStart, pathEnd);
		}
		return url.slice(pathStart, pathEnd);
	}

	return "/";
}

/**
 * Checks if a character is an ASCII hex digit.
 */
function isHexDigit(ch: string): boolean {
	return /^[0-9A-Fa-f]$/.test(ch);
}

/**
 * Checks if a character is an ASCII lowercase letter.
 */
function isLower(ch: string): boolean {
	return ch >= "a" && ch <= "z";
}

/**
 * Canonicalize the allowed/disallowed paths. For example:
 *     /SanJoséSellers ==> /Sanjos%C3%A9Sellers
 *     %aa ==> %AA
 *
 * Operations:
 * 1. Normalize percent-encoded sequences (e.g., "%aa" → "%AA")
 * 2. Percent-encode UTF-8 octets with high bit set (non-ASCII)
 *
 * @param src - The pattern to potentially escape
 * @returns Object with escaped pattern and whether escaping occurred
 */
export function maybeEscapePattern(src: string): {
	escaped: string;
	wasEscaped: boolean;
} {
	let numToEscape = 0;
	let needCapitalize = false;

	// First pass: scan the buffer to see if changes are needed. Most don't.
	for (let i = 0; i < src.length; i++) {
		const ch = src[i];
		const charCode = src.charCodeAt(i);

		// (a) % escape sequence
		if (
			ch === "%" &&
			i + 2 < src.length &&
			isHexDigit(src[i + 1]) &&
			isHexDigit(src[i + 2])
		) {
			if (isLower(src[i + 1]) || isLower(src[i + 2])) {
				needCapitalize = true;
			}
			i += 2;
			// (b) needs escaping - high bit set (non-ASCII byte)
		} else if (charCode > 127) {
			numToEscape++;
		}
		// (c) Already escaped and escape-characters normalized
	}

	// Return if no changes needed
	if (!numToEscape && !needCapitalize) {
		return { escaped: src, wasEscaped: false };
	}

	// Second pass: build escaped string
	// For UTF-8 encoding, we need to handle multi-byte characters
	const encoder = new TextEncoder();

	let result = "";

	for (let i = 0; i < src.length; i++) {
		const ch = src[i];
		const charCode = src.charCodeAt(i);

		// (a) Normalize %-escaped sequence (eg. %2f -> %2F)
		if (
			ch === "%" &&
			i + 2 < src.length &&
			isHexDigit(src[i + 1]) &&
			isHexDigit(src[i + 2])
		) {
			result += ch;
			result += src[i + 1].toUpperCase();
			result += src[i + 2].toUpperCase();
			i += 2;
			// (b) %-escape octets whose highest bit is set (non-ASCII)
		} else if (charCode > 127) {
			// Get the UTF-8 bytes for this character
			const charBytes = encoder.encode(ch);
			for (const byte of charBytes) {
				result += "%";
				result += K_HEX_DIGITS[(byte >> 4) & 0xf];
				result += K_HEX_DIGITS[byte & 0xf];
			}
			// (c) Normal character, no modification needed
		} else {
			result += ch;
		}
	}

	return { escaped: result, wasEscaped: true };
}
