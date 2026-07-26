import { Notice, Plugin, TFile } from "obsidian";
import { ContentProcessor } from "./content-processor";
import { FileMapper } from "./file-mapper";
import { GitHubAdapter } from "./github-adapter";
import {
	isAllowedImagePath,
	isAllowedPostPath,
	isWithinSourceRoot,
} from "./publishing";
import {
	DEFAULT_DATA,
	DEFAULT_SETTINGS,
	GitHubPagerSettings,
	PUBLISH_TARGET,
	StoredPluginData,
} from "./settings";
import { GitHubPagerSettingTab } from "./settings-tab";
import { SyncEngine } from "./sync-engine";

export default class GitHubPagerPlugin extends Plugin {
	settings: GitHubPagerSettings = { ...DEFAULT_SETTINGS };
	fileMapper = new FileMapper(this);
	private githubAdapter: GitHubAdapter | null = null;
	private processor = new ContentProcessor(this.app);
	private syncEngine = new SyncEngine(this);

	async onload(): Promise<void> {
		await this.loadPluginData();
		this.initAdapter();
		this.syncEngine.start();
		this.registerCommands();
		this.registerFileMenu();
		this.addSettingTab(new GitHubPagerSettingTab(this.app, this));
	}

	onunload(): void {
		this.syncEngine.stop();
	}

	async persistData(): Promise<void> {
		const data: StoredPluginData = {
			...this.settings,
			publishedRecords: this.fileMapper.records,
		};
		await this.saveData(data);
	}

	async saveSettings(): Promise<void> {
		await this.persistData();
		this.initAdapter();
	}

	async testConnection(): Promise<string | null> {
		this.requireAdapter();
		return this.githubAdapter?.verifyAuth() ?? null;
	}

	async publishOrUnpublish(file: TFile, automatic = false): Promise<void> {
		if (!isWithinSourceRoot(file.path, PUBLISH_TARGET.sourceRoot)) {
			throw new Error(`Only notes under ${PUBLISH_TARGET.sourceRoot} can be published.`);
		}
		this.syncEngine.cancel(file.path);
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const existing = this.fileMapper.get(file.path);

		if (frontmatter?.share !== true) {
			if (!existing) {
				if (!automatic) new Notice("This note has not been published.");
				return;
			}
			await this.applyRemoteChanges([], [existing.remotePath], `Unpublish ${existing.slug} from Obsidian`);
			await this.fileMapper.remove(file.path);
			new Notice(`GitHub Pager: ${existing.slug} was removed from GitHub. Deployment is pending.`);
			return;
		}

		const plan = await this.processor.buildPlan(file);
		const conflict = this.fileMapper.records.find(
			(record) => record.localPath !== file.path && record.remotePath === plan.remotePath,
		);
		if (conflict) {
			throw new Error(`The generated post path is already used by ${conflict.localPath}.`);
		}
		const deletePaths =
			existing && existing.remotePath !== plan.remotePath ? [existing.remotePath] : [];
		const changed = await this.applyRemoteChanges(
			plan.files,
			deletePaths,
			`Publish ${plan.slug} from Obsidian`,
		);
		await this.fileMapper.upsert({
			localPath: file.path,
			remotePath: plan.remotePath,
			slug: plan.slug,
			lastSynced: new Date().toISOString(),
		});
		new Notice(
			changed
				? `GitHub Pager: ${plan.slug} was committed. GitHub Pages deployment is pending.`
				: `GitHub Pager: ${plan.slug} is already up to date.`,
		);
	}

	private registerCommands(): void {
		this.addCommand({
			id: "test-github-connection",
			name: "Test GitHub connection",
			callback: async () => {
				try {
					const user = await this.testConnection();
					new Notice(
						user
							? `GitHub Pager: Connected as ${user}.`
							: "GitHub Pager: Authentication failed.",
					);
				} catch (error) {
					new Notice(`GitHub Pager: ${formatError(error)}`);
				}
			},
		});

		this.addCommand({
			id: "publish-current-file-now",
			name: "Publish or unpublish current note now",
			callback: async () => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					new Notice("No active note.");
					return;
				}
				try {
					await this.publishOrUnpublish(file);
				} catch (error) {
					console.error(error);
					new Notice(`GitHub Pager: ${formatError(error)}`);
				}
			},
		});
	}

	private registerFileMenu(): void {
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFile) || !isWithinSourceRoot(file.path, PUBLISH_TARGET.sourceRoot)) {
					return;
				}
				menu.addItem((item) => {
					item
						.setTitle("Publish or unpublish on GitHub")
						.setIcon("github")
						.onClick(async () => {
							try {
								await this.publishOrUnpublish(file);
							} catch (error) {
								console.error(error);
								new Notice(`GitHub Pager: ${formatError(error)}`);
							}
						});
				});
			}),
		);
	}

	private async loadPluginData(): Promise<void> {
		const raw = (await this.loadData()) as Partial<StoredPluginData> | null;
		const data = { ...DEFAULT_DATA, ...(raw ?? {}) };
		this.settings = {
			githubTokenSecretId: data.githubTokenSecretId,
			autoSync: data.autoSync,
			debounceMinutes: data.debounceMinutes,
		};
		this.fileMapper.load(Array.isArray(data.publishedRecords) ? data.publishedRecords : []);

		// Never retain tokens written by older GitHub Pager versions.
		if (raw && "githubToken" in raw) {
			delete (raw as Record<string, unknown>).githubToken;
			await this.persistData();
		}
	}

	private initAdapter(): void {
		const secretId = this.settings.githubTokenSecretId;
		const token = secretId ? this.app.secretStorage.getSecret(secretId) : null;
		this.githubAdapter = token
			? new GitHubAdapter(
					token,
					PUBLISH_TARGET.owner,
					PUBLISH_TARGET.repository,
					PUBLISH_TARGET.branch,
				)
			: null;
	}

	private requireAdapter(): void {
		if (!this.githubAdapter) {
			throw new Error("Select a GitHub token in Settings → GitHub Pager.");
		}
	}

	private async applyRemoteChanges(
		files: Array<{ path: string; contentBase64: string }>,
		deletePaths: string[],
		message: string,
	): Promise<boolean> {
		this.requireAdapter();
		for (const file of files) {
			if (
				!isAllowedPostPath(file.path, PUBLISH_TARGET.postsPath) &&
				!isAllowedImagePath(file.path, PUBLISH_TARGET.imagePath)
			) {
				throw new Error(`Blocked unsafe GitHub path: ${file.path}`);
			}
		}
		for (const path of deletePaths) {
			if (!isAllowedPostPath(path, PUBLISH_TARGET.postsPath)) {
				throw new Error(`Blocked unsafe delete path: ${path}`);
			}
		}
		if (files.length === 0 && deletePaths.length === 0) return false;
		return (await this.githubAdapter?.applyChanges(files, deletePaths, message)) ?? false;
	}
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : "Unexpected error.";
}
