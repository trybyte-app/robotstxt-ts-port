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

import { K_ALLOW_FREQUENT_TYPOS } from "./constants.js";
import { KeyType } from "./types.js";

/**
 * Result of parsing a robots.txt key.
 */
export interface ParsedKeyResult {
	type: KeyType;
	isAcceptableTypo: boolean;
	/** For unknown keys, the original key text. */
	unknownText?: string;
}

/**
 * A robots.txt has lines of key/value pairs. ParsedRobotsKey represents
 * a key. This class can parse a text-representation (including common typos)
 * and represent them as an enumeration which allows for faster processing
 * afterwards.
 */
export class ParsedRobotsKey {
	private type: KeyType = KeyType.UNKNOWN;
	private keyText: string = "";

	/**
	 * Parse given key text and return the key type and whether it's a typo.
	 */
	public parse(key: string): ParsedKeyResult {
		this.keyText = "";
		let isAcceptableTypo = false;

		if (this.keyIsUserAgent(key)) {
			isAcceptableTypo = this.isUserAgentTypo(key);
			this.type = KeyType.USER_AGENT;
		} else if (this.keyIsAllow(key)) {
			isAcceptableTypo = false; // No typos accepted for allow
			this.type = KeyType.ALLOW;
		} else if (this.keyIsDisallow(key)) {
			isAcceptableTypo = this.isDisallowTypo(key);
			this.type = KeyType.DISALLOW;
		} else if (this.keyIsSitemap(key)) {
			isAcceptableTypo = this.isSitemapTypo(key);
			this.type = KeyType.SITEMAP;
		} else {
			this.type = KeyType.UNKNOWN;
			this.keyText = key;
		}

		return {
			type: this.type,
			isAcceptableTypo,
			unknownText: this.type === KeyType.UNKNOWN ? this.keyText : undefined,
		};
	}

	/**
	 * Returns the type of key.
	 */
	public getType(): KeyType {
		return this.type;
	}

	/**
	 * If this is an unknown key, get the text.
	 */
	public getUnknownText(): string {
		if (this.type !== KeyType.UNKNOWN || !this.keyText) {
			throw new Error("getUnknownText called on non-unknown key");
		}
		return this.keyText;
	}

	/**
	 * Check if key starts with a string (case-insensitive).
	 */
	private startsWithIgnoreCase(key: string, prefix: string): boolean {
		return key.toLowerCase().startsWith(prefix.toLowerCase());
	}

	/**
	 * Check if key is User-Agent or a typo variant.
	 */
	private keyIsUserAgent(key: string): boolean {
		if (this.startsWithIgnoreCase(key, "user-agent")) {
			return true;
		}
		if (K_ALLOW_FREQUENT_TYPOS) {
			// Typo variants: "useragent", "user agent"
			if (
				this.startsWithIgnoreCase(key, "useragent") ||
				this.startsWithIgnoreCase(key, "user agent")
			) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Check if key is a User-Agent typo.
	 */
	private isUserAgentTypo(key: string): boolean {
		if (!K_ALLOW_FREQUENT_TYPOS) return false;
		return (
			this.startsWithIgnoreCase(key, "useragent") ||
			this.startsWithIgnoreCase(key, "user agent")
		);
	}

	/**
	 * Check if key is Allow.
	 */
	private keyIsAllow(key: string): boolean {
		// We don't support typos for the "allow" key.
		return this.startsWithIgnoreCase(key, "allow");
	}

	/**
	 * Check if key is Disallow or a typo variant.
	 */
	private keyIsDisallow(key: string): boolean {
		if (this.startsWithIgnoreCase(key, "disallow")) {
			return true;
		}
		if (K_ALLOW_FREQUENT_TYPOS) {
			// Typo variants: dissallow, dissalow, disalow, diasllow, disallaw
			if (
				this.startsWithIgnoreCase(key, "dissallow") ||
				this.startsWithIgnoreCase(key, "dissalow") ||
				this.startsWithIgnoreCase(key, "disalow") ||
				this.startsWithIgnoreCase(key, "diasllow") ||
				this.startsWithIgnoreCase(key, "disallaw")
			) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Check if key is a Disallow typo.
	 */
	private isDisallowTypo(key: string): boolean {
		if (!K_ALLOW_FREQUENT_TYPOS) return false;
		return (
			this.startsWithIgnoreCase(key, "dissallow") ||
			this.startsWithIgnoreCase(key, "dissalow") ||
			this.startsWithIgnoreCase(key, "disalow") ||
			this.startsWithIgnoreCase(key, "diasllow") ||
			this.startsWithIgnoreCase(key, "disallaw")
		);
	}

	/**
	 * Check if key is Sitemap or a typo variant.
	 */
	private keyIsSitemap(key: string): boolean {
		if (this.startsWithIgnoreCase(key, "sitemap")) {
			return true;
		}
		if (K_ALLOW_FREQUENT_TYPOS) {
			// Typo variant: site-map
			if (this.startsWithIgnoreCase(key, "site-map")) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Check if key is a Sitemap typo.
	 */
	private isSitemapTypo(key: string): boolean {
		if (!K_ALLOW_FREQUENT_TYPOS) return false;
		return this.startsWithIgnoreCase(key, "site-map");
	}
}
