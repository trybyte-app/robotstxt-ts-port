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
 * Metadata about a parsed line in robots.txt.
 */
export interface LineMetadata {
	/** Indicates if the line is totally empty. */
	isEmpty: boolean;
	/** Indicates if the line has a comment (may have content before it). */
	hasComment: boolean;
	/** Indicates if the whole line is a comment. */
	isComment: boolean;
	/** Indicates that the line has a valid robots.txt directive. */
	hasDirective: boolean;
	/** Indicates that the found directive is an accepted typo variant. */
	isAcceptableTypo: boolean;
	/** Indicates that the line is too long (over 2083 * 8 bytes). */
	isLineTooLong: boolean;
	/** Indicates that the key-value pair is missing the colon separator. */
	isMissingColonSeparator: boolean;
}

/**
 * Creates a default LineMetadata object.
 */
export function createLineMetadata(): LineMetadata {
	return {
		isEmpty: false,
		hasComment: false,
		isComment: false,
		hasDirective: false,
		isAcceptableTypo: false,
		isLineTooLong: false,
		isMissingColonSeparator: false,
	};
}

/**
 * Key types for robots.txt directives.
 */
export enum KeyType {
	USER_AGENT = 0,
	SITEMAP = 1,
	ALLOW = 2,
	DISALLOW = 3,
	/** Unrecognized field; high number to avoid serialization changes. */
	UNKNOWN = 128,
}

/**
 * Tag names for parsed lines in robots.txt reporting.
 */
export enum RobotsTagName {
	/**
	 * Identifier for skipped lines. A line may be skipped because it's
	 * unparseable, or because it contains no recognizable key.
	 */
	Unknown = 0,
	UserAgent = 1,
	Allow = 2,
	Disallow = 3,
	Sitemap = 4,
	/**
	 * Identifier for parseable lines whose key is recognized, but unused.
	 * E.g., noindex, noarchive, crawl-delay.
	 */
	Unused = 5,
}

/**
 * Represents a parsed line from robots.txt with metadata.
 */
export interface RobotsParsedLine {
	lineNum: number;
	tagName: RobotsTagName;
	isTypo: boolean;
	metadata: LineMetadata;
}

/**
 * Creates a default RobotsParsedLine object.
 */
export function createRobotsParsedLine(): RobotsParsedLine {
	return {
		lineNum: 0,
		tagName: RobotsTagName.Unknown,
		isTypo: false,
		metadata: createLineMetadata(),
	};
}

/**
 * Handler for directives found in robots.txt. These callbacks are called by
 * parseRobotsTxt() in the sequence they have been found in the file.
 */
export abstract class RobotsParseHandler {
	abstract handleRobotsStart(): void;
	abstract handleRobotsEnd(): void;

	abstract handleUserAgent(lineNum: number, value: string): void;
	abstract handleAllow(lineNum: number, value: string): void;
	abstract handleDisallow(lineNum: number, value: string): void;

	abstract handleSitemap(lineNum: number, value: string): void;

	/** Any other unrecognized name/value pairs. */
	abstract handleUnknownAction(
		lineNum: number,
		action: string,
		value: string,
	): void;

	/** Optional callback for line metadata. Default is no-op. */
	reportLineMetadata(_lineNum: number, _metadata: LineMetadata): void {
		// Default implementation does nothing
	}
}
