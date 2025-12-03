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

/**
 * Returns true if URI path matches the specified pattern. Pattern is anchored
 * at the beginning of path. '$' is special only at the end of pattern.
 *
 * Since 'path' and 'pattern' are both externally determined (by the webmaster),
 * we make sure to have acceptable worst-case performance.
 *
 * Pattern rules:
 * - '*' wildcard: matches any sequence of characters (including empty)
 * - '$' end anchor: only valid at end of pattern, matches end of path
 * - All other characters: literal match
 * - Pattern is implicitly anchored at beginning of path
 *
 * Algorithm: Dynamic Programming / NFA Simulation
 * The pos[] array holds a sorted list of indexes of 'path', with length
 * 'numPos'. At the start and end of each iteration of the main loop,
 * the pos[] array holds a list of the prefixes of the 'path' which can
 * match the current prefix of 'pattern'. If this list is ever empty,
 * return false. If we reach the end of 'pattern' with at least one element
 * in pos[], return true.
 *
 * Time Complexity: O(path_length * pattern_length)
 *
 * @param path - The URL path to match against
 * @param pattern - The robots.txt pattern to match
 * @returns True if the path matches the pattern
 */
export function matches(path: string, pattern: string): boolean {
	const pathLen = path.length;

	// The pos[] array holds possible matching positions in the path
	const pos: number[] = new Array(pathLen + 1);

	// Initialize - path position 0 can match pattern start
	pos[0] = 0;
	let numPos = 1;

	for (let p = 0; p < pattern.length; p++) {
		const pat = pattern[p];

		// Handle '$' (End Anchor) - only valid at pattern end
		if (pat === "$" && p === pattern.length - 1) {
			return pos[numPos - 1] === pathLen;
		}

		// Handle '*' (Wildcard) - matches any sequence
		if (pat === "*") {
			// Create all positions from current to end of path
			numPos = pathLen - pos[0] + 1;
			for (let i = 1; i < numPos; i++) {
				pos[i] = pos[i - 1] + 1;
			}
			continue;
		}

		// Handle literal character (includes '$' when not at end of pattern)
		let newNumPos = 0;
		for (let i = 0; i < numPos; i++) {
			if (pos[i] < pathLen && path[pos[i]] === pat) {
				pos[newNumPos++] = pos[i] + 1;
			}
		}

		if (newNumPos === 0) {
			return false;
		}
		numPos = newNumPos;
	}

	// Pattern fully consumed with valid positions
	return true;
}
