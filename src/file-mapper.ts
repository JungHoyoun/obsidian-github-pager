import type GitHubPagerPlugin from "./main";
import type { PublishedRecord } from "./settings";

export class FileMapper {
	private readonly plugin: GitHubPagerPlugin;
	records: PublishedRecord[] = [];

	constructor(plugin: GitHubPagerPlugin) {
		this.plugin = plugin;
	}

	load(records: PublishedRecord[]): void {
		this.records = records;
	}

	get(localPath: string): PublishedRecord | undefined {
		return this.records.find((record) => record.localPath === localPath);
	}

	async upsert(record: PublishedRecord): Promise<void> {
		const index = this.records.findIndex((candidate) => candidate.localPath === record.localPath);
		if (index >= 0) {
			this.records[index] = record;
		} else {
			this.records.push(record);
		}
		await this.plugin.persistData();
	}

	async remove(localPath: string): Promise<void> {
		this.records = this.records.filter((record) => record.localPath !== localPath);
		await this.plugin.persistData();
	}

	async rename(oldPath: string, newPath: string): Promise<void> {
		const record = this.get(oldPath);
		if (!record) return;
		record.localPath = newPath;
		await this.plugin.persistData();
	}
}
