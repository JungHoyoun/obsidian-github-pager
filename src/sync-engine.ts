import { TFile, debounce, Notice, Debouncer, arrayBufferToBase64 } from "obsidian";
import GitHubPagerPlugin from "./main";
import { FileMapper } from "./file-mapper";

export class SyncEngine {
    plugin: GitHubPagerPlugin;
    fileMapper: FileMapper;
    syncQueue: Set<string> = new Set();
    debouncedProcess: Debouncer<[], Promise<void>>;

    constructor(plugin: GitHubPagerPlugin, fileMapper: FileMapper) {
        this.plugin = plugin;
        this.fileMapper = fileMapper;
        this.debouncedProcess = debounce(this.processQueue.bind(this), 2000, true);
    }

    start() {
        this.plugin.registerEvent(
            this.plugin.app.vault.on('modify', (file) => {
                if (file instanceof TFile && this.plugin.settings.autoSync) {
                    this.onModify(file);
                }
            })
        );
    }

    onModify(file: TFile) {
        // Check if file has an enabled mapping
        const mapping = this.fileMapper.getMapping(file.path);
        if (mapping && mapping.enabled) {
            this.syncQueue.add(file.path);
            this.debouncedProcess();
            return;
        }

        // Fallback: check share frontmatter (backward compatibility)
        const cache = this.plugin.app.metadataCache.getFileCache(file);
        if (cache?.frontmatter?.share === true) {
            this.syncQueue.add(file.path);
            this.debouncedProcess();
        }
    }

    async processQueue() {
        if (!this.plugin.githubAdapter || !this.plugin.processor) return;

        const paths = Array.from(this.syncQueue);
        this.syncQueue.clear();

        // Collect files with changes for batch sync
        const filesToSync: { path: string; localPath: string; contentBase64: string }[] = [];

        for (const path of paths) {
            const file = this.plugin.app.vault.getAbstractFileByPath(path);
            if (file instanceof TFile) {
                const content = await this.plugin.processor.process(file);
                const data = new TextEncoder().encode(content);
                const contentBase64 = arrayBufferToBase64(data.buffer);

                // Get remote path
                const remoteFilePath = await this.fileMapper.getRemoteFilePath(file.path, file);
                let remotePath: string;
                if (remoteFilePath) {
                    if (remoteFilePath.includes('.')) {
                        remotePath = remoteFilePath.replace(/^\//, '');
                    } else {
                        const base = remoteFilePath.replace(/^\//, '').replace(/\/$/, '');
                        remotePath = base ? `${base}/${file.name}` : file.name;
                    }
                } else {
                    const base = this.plugin.settings.basePath.replace(/^\//, '').replace(/\/$/, '');
                    remotePath = base ? `${base}/${file.name}` : file.name;
                }

                if (await this.plugin.githubAdapter.hasChanges(remotePath, contentBase64)) {
                    filesToSync.push({ path: remotePath, localPath: path, contentBase64 });
                }
            }
        }

        if (filesToSync.length === 0) {
            return; // Nothing to sync
        }

        if (filesToSync.length === 1) {
            // Single file - use regular push
            const f = filesToSync[0]!;
            const file = this.plugin.app.vault.getAbstractFileByPath(f.localPath);
            if (file instanceof TFile) {
                new Notice(`Auto-syncing ${file.name}...`);
                await this.plugin.pushFile(file, false);
            }
            return;
        }

        // Multiple files - use batch sync
        const fileList = filesToSync.map(f => ({ path: f.path, contentBase64: f.contentBase64 }));
        const message = `Auto-sync ${filesToSync.length} files via Obsidian`;

        new Notice(`Auto-syncing ${filesToSync.length} files...`);
        const success = await this.plugin.githubAdapter.pushFilesBatch(fileList, message, this.plugin.settings.defaultBranch);

        if (success) {
            for (const f of filesToSync) {
                await this.fileMapper.updateLastSynced(f.localPath);
            }
            new Notice(`Auto-sync complete: ${filesToSync.length} files.`);
        }
    }
}
