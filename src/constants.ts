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
 * Maximum line length for robots.txt parsing.
 * Certain browsers limit the URL length to 2083 bytes. In a robots.txt,
 * it's fairly safe to assume any valid line isn't going to be more than
 * many times that max URL length.
 */
export const K_MAX_LINE_LEN = 2083 * 8; // 16,664 bytes

/**
 * Browser maximum URL length - reference value.
 */
export const K_BROWSER_MAX_LINE_LEN = 2083;

/**
 * Allow for typos such as DISALOW in robots.txt.
 */
export const K_ALLOW_FREQUENT_TYPOS = true;

/**
 * Hexadecimal digits for percent-encoding.
 */
export const K_HEX_DIGITS = "0123456789ABCDEF";

/**
 * UTF-8 Byte Order Mark bytes.
 */
export const UTF8_BOM: readonly number[] = [0xef, 0xbb, 0xbf];

/**
 * Indicates no match in pattern matching.
 */
export const K_NO_MATCH_PRIORITY = -1;

/**
 * Unsupported but recognized tags in robots.txt.
 * These are popular tags that Google doesn't use, but other search engines may.
 */
export const K_UNSUPPORTED_TAGS: readonly string[] = [
	"clean-param",
	"crawl-delay",
	"host",
	"noarchive",
	"noindex",
	"nofollow",
];
