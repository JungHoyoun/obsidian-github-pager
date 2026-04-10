import { Plugin, Notice, TFile, arrayBufferToBase64 } from 'obsidian';
import { GitHubPagerSettings, DEFAULT_SETTINGS } from "./settings";
import { GitHubPagerSettingTab } from "./settings-tab";
import { GitHubAdapter } from "./github-adapter";
import { ContentProcessor } from "./content-processor";
import { FileMapper } from "./file-mapper";
import { SyncEngine } from "./sync-engine";

export default class GitHubPagerPlugin extends Plugin {
	settings: GitHubPagerSettings;
	githubAdapter: GitHubAdapter | null = null;
	processor: ContentProcessor | null = null;
	fileMapper: FileMapper | null = null;
	syncEngine: SyncEngine | null = null;

	async onload() {
		await this.loadSettings();

		this.initAdapter();
		this.initFileMapper();

		this.addCommand({
			id: 'test-github-connection',
			name: 'Test GitHub connection',
			callback: async () => {
				if (!this.githubAdapter) {
					new Notice('GitHub adapter not initialized. Check settings.');
					return;
				}
				const user = await this.githubAdapter.verifyAuth();
				if (user) {
					new Notice(`Authenticated as ${user}`);
				} else {
					new Notice('Authentication failed. Check token.');
				}
			}
		});

		this.addCommand({
			id: 'push-current-file',
			name: 'Push current file to GitHub',
			callback: async () => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					new Notice('No active file.');
					return;
				}
				if (!this.githubAdapter || !this.processor) {
					new Notice('GitHub adapter not ready.');
					return;
				}

				try {
					await this.pushFile(file);
				} catch (e) {
					console.error(e);
					new Notice('Error pushing file.');
				}
			}
		});

		this.addCommand({
			id: 'sync-all-mapped-files',
			name: 'Sync all mapped files to GitHub',
			callback: async () => {
				if (!this.fileMapper || !this.githubAdapter || !this.processor) {
					new Notice('Plugin not ready.');
					return;
				}

				const mappings = this.fileMapper.getEnabledMappings();
				if (mappings.length === 0) {
					new Notice('No enabled mappings found.');
					return;
				}

				// Collect files that have changes
				const filesToSync: { mapping: typeof mappings[0]; file: TFile; path: string; contentBase64: string }[] = [];

				for (const mapping of mappings) {
					const file = this.app.vault.getAbstractFileByPath(mapping.localPath);
					if (file instanceof TFile) {
						const content = await this.processor.process(file);
						const data = new TextEncoder().encode(content);
						const contentBase64 = arrayBufferToBase64(data.buffer);

						let remotePath: string;
						if (mapping.remoteFilePath.includes('.')) {
							remotePath = mapping.remoteFilePath.replace(/^\//, '');
						} else {
							const base = mapping.remoteFilePath.replace(/^\//, '').replace(/\/$/, '');
							remotePath = base ? `${base}/${file.name}` : file.name;
						}

						if (await this.githubAdapter.hasChanges(remotePath, contentBase64)) {
							filesToSync.push({ mapping, file, path: remotePath, contentBase64 });
						}
					}
				}

				if (filesToSync.length === 0) {
					new Notice('All files are up to date.');
					return;
				}

				const fileList = filesToSync.map(f => ({ path: f.path, contentBase64: f.contentBase64 }));
				const fileNames = filesToSync.map(f => f.file.name).join(', ');
				const message = `Sync ${filesToSync.length} files via Obsidian: ${fileNames}`;

				new Notice(`Syncing ${filesToSync.length} files...`);
				const success = await this.githubAdapter.pushFilesBatch(fileList, message, this.settings.defaultBranch);

				if (success) {
					for (const f of filesToSync) {
						await this.fileMapper.updateLastSynced(f.mapping.localPath);
					}
					new Notice(`Successfully synced ${filesToSync.length} files.`);
				} else {
					new Notice('Batch sync failed.');
				}
			}
		});

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (file instanceof TFile) {
					menu.addItem((item) => {
						item
							.setTitle("Sync to GitHub")
							.setIcon("github")
							.onClick(async () => {
								await this.pushFile(file);
							});
					});
				}
			})
		);

		this.addSettingTab(new GitHubPagerSettingTab(this.app, this));
	}

	async pushFile(file: TFile, autoAdd = true): Promise<boolean> {
		if (!this.processor || !this.githubAdapter) return false;

		// Auto-add mapping if file doesn't have one
		if (autoAdd && this.fileMapper && !this.fileMapper.findMappingByPath(file.path)) {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			const remotePath = (frontmatter?.remote_path as string) || this.settings.basePath;
			await this.fileMapper.autoAddMapping(file.path, remotePath);
		}

		const content = await this.processor.process(file);
		const encoder = new TextEncoder();
		const data = encoder.encode(content);
		const contentBase64 = arrayBufferToBase64(data.buffer);

		// Try to get remote file path from mapping table first
		let remotePath: string;
		if (this.fileMapper) {
			const mappedPath = await this.fileMapper.getRemoteFilePath(file.path, file);
			if (mappedPath) {
				// If mappedPath contains a file extension, use it directly as full path
				// Otherwise treat it as a directory and append local filename
				if (mappedPath.includes('.')) {
					remotePath = mappedPath.replace(/^\//, '');
				} else {
					const base = mappedPath.replace(/^\//, '').replace(/\/$/, '');
					remotePath = base ? `${base}/${file.name}` : file.name;
				}
			} else {
				// Fallback to frontmatter remote_path
				const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
				const fallback = (frontmatter?.remote_path as string) || this.settings.basePath;
				const base = fallback.replace(/^\//, '').replace(/\/$/, '');
				remotePath = base ? `${base}/${file.name}` : file.name;
			}
		} else {
			// Fallback to frontmatter or default
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			const fallback = (frontmatter?.remote_path as string) || this.settings.basePath;
			const base = fallback.replace(/^\//, '').replace(/\/$/, '');
			remotePath = base ? `${base}/${file.name}` : file.name;
		}

		// Check if content changed before pushing
		if (!(await this.githubAdapter.hasChanges(remotePath, contentBase64))) {
			new Notice(`No changes for ${file.name}, skipping.`);
			return true;
		}

		const message = this.settings.commitMessage.replace('{{file}}', file.name);

		new Notice(`Pushing ${file.name}...`);
		const success = await this.githubAdapter.pushFile(remotePath, contentBase64, message);

		if (success) {
			new Notice(`Successfully pushed ${file.name}`);
		} else {
			new Notice(`Failed to push ${file.name}`);
		}
		return success;
	}




	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()) as GitHubPagerSettings;
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.initAdapter();
	}

	initAdapter() {
		if (this.settings.githubToken && this.settings.repositoryOwner && this.settings.repositoryName) {
			const adapter = new GitHubAdapter(
				this.settings.githubToken,
				this.settings.repositoryOwner,
				this.settings.repositoryName
			);
			this.githubAdapter = adapter;
			this.processor = new ContentProcessor(adapter, this.app, this.settings);
		} else {
			this.githubAdapter = null;
			this.processor = null;
		}
	}

	initFileMapper() {
		this.fileMapper = new FileMapper(this);
		this.fileMapper.loadMappings();
		this.syncEngine = new SyncEngine(this, this.fileMapper);
		this.syncEngine.start();
	}
}

