import { Notice, TFile } from "obsidian";
import type GitHubPagerPlugin from "./main";
import { isWithinSourceRoot } from "./publishing";
import { PUBLISH_TARGET } from "./settings";

export class SyncEngine {
	private readonly timers = new Map<string, number>();

	constructor(private readonly plugin: GitHubPagerPlugin) {}

	start(): void {
		this.plugin.registerEvent(
			this.plugin.app.vault.on("modify", (file) => {
				if (!(file instanceof TFile) || !this.plugin.settings.autoSync) return;
				if (!this.shouldTrack(file)) return;
				this.schedule(file);
			}),
		);
		this.plugin.registerEvent(
			this.plugin.app.vault.on("rename", async (file, oldPath) => {
				if (file instanceof TFile) {
					await this.plugin.fileMapper.rename(oldPath, file.path);
				}
			}),
		);
	}

	cancel(path: string): void {
		const timer = this.timers.get(path);
		if (timer !== undefined) {
			window.clearTimeout(timer);
			this.timers.delete(path);
		}
	}

	stop(): void {
		for (const timer of this.timers.values()) window.clearTimeout(timer);
		this.timers.clear();
	}

	private shouldTrack(file: TFile): boolean {
		if (!isWithinSourceRoot(file.path, PUBLISH_TARGET.sourceRoot)) return false;
		const frontmatter = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
		return frontmatter?.share === true || this.plugin.fileMapper.get(file.path) !== undefined;
	}

	private schedule(file: TFile): void {
		this.cancel(file.path);
		const delay = Math.max(1, this.plugin.settings.debounceMinutes) * 60_000;
		const timer = window.setTimeout(() => {
			this.timers.delete(file.path);
			void this.plugin.publishOrUnpublish(file, true).catch((error) => {
				console.error(error);
				new Notice(`GitHub Pager: ${formatError(error)}`);
			});
		}, delay);
		this.timers.set(file.path, timer);
	}
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : "Automatic publish failed.";
}
