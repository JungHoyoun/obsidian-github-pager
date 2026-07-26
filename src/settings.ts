export interface GitHubPagerSettings {
	githubTokenSecretId: string;
	autoSync: boolean;
	debounceMinutes: number;
}

export interface PublishedRecord {
	localPath: string;
	remotePath: string;
	slug: string;
	lastSynced: string;
}

export interface StoredPluginData extends GitHubPagerSettings {
	publishedRecords: PublishedRecord[];
}

export const PUBLISH_TARGET = {
	owner: "JungHoyoun",
	repository: "JungHoyoun.github.io",
	branch: "main",
	sourceRoot: "0. Slip-box/",
	postsPath: "_posts",
	imagePath: "assets/img/posts",
} as const;

export const DEFAULT_SETTINGS: GitHubPagerSettings = {
	githubTokenSecretId: "",
	autoSync: false,
	debounceMinutes: 10,
};

export const DEFAULT_DATA: StoredPluginData = {
	...DEFAULT_SETTINGS,
	publishedRecords: [],
};
