import { TFile } from 'obsidian';
import GitHubPagerPlugin from './main';

interface PluginData {
    mappings?: FileMapping[];
    [key: string]: unknown;
}

export interface FileMapping {
    localPath: string;
    remoteFilePath: string;
    enabled: boolean;
    lastSynced?: string;
}

export class FileMapper {
    plugin: GitHubPagerPlugin;
    mappings: FileMapping[] = [];

    constructor(plugin: GitHubPagerPlugin) {
        this.plugin = plugin;
    }

    async loadMappings(): Promise<FileMapping[]> {
        const data = await this.plugin.loadData() as PluginData;
        if (data && Array.isArray(data.mappings)) {
            this.mappings = data.mappings;
        }
        return this.mappings;
    }

    async saveMappings(): Promise<void> {
        const data = await this.plugin.loadData() as PluginData;
        await this.plugin.saveData({
            ...data,
            mappings: this.mappings
        });
    }

    getMapping(localPath: string): FileMapping | undefined {
        return this.mappings.find(m => m.localPath === localPath);
    }

    findMappingByPath(localPath: string): FileMapping | undefined {
        // 1. Exact match
        let mapping = this.getMapping(localPath);
        if (mapping) return mapping;

        // 2. No .md suffix -> try adding .md
        if (!localPath.endsWith('.md')) {
            mapping = this.getMapping(localPath + '.md');
            if (mapping) return mapping;
        }

        // 3. Has .md suffix -> try removing it
        if (localPath.endsWith('.md')) {
            mapping = this.getMapping(localPath.replace(/\.md$/, ''));
            if (mapping) return mapping;
        }

        return undefined;
    }

    getRemoteFilePath(localPath: string, file: TFile): string | null {
        const mapping = this.findMappingByPath(localPath);
        if (mapping && mapping.enabled) {
            return mapping.remoteFilePath;
        }

        // Fallback to frontmatter remote_path
        const cache = this.plugin.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;
        if (frontmatter?.remote_path && typeof frontmatter.remote_path === 'string') {
            return frontmatter.remote_path;
        }

        return null;
    }

    async autoAddMapping(localPath: string, remoteFilePath: string): Promise<void> {
        const existing = this.getMapping(localPath);
        if (existing) return;

        this.mappings.push({
            localPath,
            remoteFilePath,
            enabled: true
        });
        await this.saveMappings();
    }

    async addMapping(localPath: string, remoteFilePath: string): Promise<void> {
        const existing = this.getMapping(localPath);
        if (existing) {
            existing.remoteFilePath = remoteFilePath;
            existing.enabled = true;
        } else {
            this.mappings.push({
                localPath,
                remoteFilePath,
                enabled: true
            });
        }
        await this.saveMappings();
    }

    async removeMapping(localPath: string): Promise<void> {
        this.mappings = this.mappings.filter(m => m.localPath !== localPath);
        await this.saveMappings();
    }

    async toggleMapping(localPath: string, enabled: boolean): Promise<void> {
        const mapping = this.getMapping(localPath);
        if (mapping) {
            mapping.enabled = enabled;
            await this.saveMappings();
        }
    }

    async updateMapping(localPath: string, newRemotePath: string): Promise<void> {
        const mapping = this.getMapping(localPath);
        if (mapping) {
            mapping.remoteFilePath = newRemotePath;
            await this.saveMappings();
        }
    }

    async updateLastSynced(localPath: string): Promise<void> {
        const mapping = this.getMapping(localPath);
        if (mapping) {
            mapping.lastSynced = new Date().toISOString();
            await this.saveMappings();
        }
    }

    getEnabledMappings(): FileMapping[] {
        return this.mappings.filter(m => m.enabled);
    }

    async addMappingFromFile(file: TFile, remoteFilePath: string): Promise<void> {
        await this.addMapping(file.path, remoteFilePath);
    }
}
