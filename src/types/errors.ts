export class ScraperError extends Error {
	readonly provider: string;
	readonly statusCode?: number;

	constructor(message: string, provider: string, statusCode?: number) {
		super(message);
		this.name = "ScraperError";
		this.provider = provider;
		this.statusCode = statusCode;
	}
}

export class MatcherError extends Error {
	readonly gameName: string;

	constructor(message: string, gameName: string) {
		super(message);
		this.name = "MatcherError";
		this.gameName = gameName;
	}
}

export class CheckerError extends Error {
	readonly appId: string;

	constructor(message: string, appId: string) {
		super(message);
		this.name = "CheckerError";
		this.appId = appId;
	}
}
