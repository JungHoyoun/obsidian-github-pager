import { App, PluginSettingTab, Setting } from 'obsidian';
import GitHubPagerPlugin from './main';
import { FileMapping } from './file-mapper';

interface AddMappingState {
    localPathValue: string;
    remotePathValue: string;
}

export class GitHubPagerSettingTab extends PluginSettingTab {
    plugin: GitHubPagerPlugin;
    addMappingState: AddMappingState = { localPathValue: '', remotePathValue: '' };

    constructor(app: App, plugin: GitHubPagerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName('GitHub token')
            .setDesc('The personal access token with repo scope. See https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token')
            .addText(text => text
                .setPlaceholder('It should be something like `ghp_...`')
                .setValue(this.plugin.settings.githubToken)
                .onChange(async (value) => {
                    this.plugin.settings.githubToken = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Repository owner')
            .setDesc('The owner of the repository (user or org), like: octocat')
            .addText(text => text
                .setValue(this.plugin.settings.repositoryOwner)
                .onChange(async (value) => {
                    this.plugin.settings.repositoryOwner = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Repository name')
            .setDesc('The name of the repository, like: hello-world')
            .addText(text => text
                .setValue(this.plugin.settings.repositoryName)
                .onChange(async (value) => {
                    this.plugin.settings.repositoryName = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Base path')
            .setDesc('Path in the repo where notes will be saved (e.g. content/posts).')
            .addText(text => text
                .setPlaceholder('The directory path in the remote repo, e.g. content/posts')
                .setValue(this.plugin.settings.basePath)
                .onChange(async (value) => {
                    this.plugin.settings.basePath = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Image path')
            .setDesc('Path in the repo where images will be saved.')
            .addText(text => text
                .setPlaceholder('The directory path in the remote repo for images, e.g. static/images')
                .setValue(this.plugin.settings.imagePath)
                .onChange(async (value) => {
                    this.plugin.settings.imagePath = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Commit message')
            .setDesc('Commit message template. Use {{file}} as a placeholder for the filename.')
            .addText(text => text
                .setPlaceholder('Update {{file}} via Obsidian')
                .setValue(this.plugin.settings.commitMessage)
                .onChange(async (value) => {
                    this.plugin.settings.commitMessage = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Auto sync')
            .setDesc('Automatically push changes to GitHub when you save a file with the "share" frontmatter property set to true.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoSync)
                .onChange(async (value) => {
                    this.plugin.settings.autoSync = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Default branch')
            .setDesc('The default branch for batch commits. Usually "main" or "master".')
            .addText(text => text
                .setValue(this.plugin.settings.defaultBranch)
                .onChange(async (value) => {
                    this.plugin.settings.defaultBranch = value || 'main';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('File mappings')
            .setDesc('Manage the mapping between local vault files and remote GitHub paths. When a mapped file is modified, it will be synced to the specified remote path.')
            .setHeading();

        this.displayMappings(containerEl);
    }

    displayMappings(containerEl: HTMLElement): void {
        const mappings = this.plugin.fileMapper?.mappings || [];

        if (mappings.length === 0) {
            new Setting(containerEl)
                .setName('No mappings configured')
                .setDesc('Add one below.');
        } else {
            const listEl = containerEl.createEl('div', { cls: 'github-pager-mapping-list' });
            for (const mapping of mappings) {
                this.createMappingItem(listEl, mapping);
            }
        }

        this.createAddMappingSection(containerEl);
    }

    createMappingItem(containerEl: HTMLElement, mapping: FileMapping): void {
        const itemEl = containerEl.createEl('div', { cls: 'github-pager-mapping-item' });

        const checkbox = itemEl.createEl('input', { type: 'checkbox' });
        checkbox.checked = mapping.enabled;
        checkbox.onclick = async () => {
            await this.plugin.fileMapper?.toggleMapping(mapping.localPath, checkbox.checked);
            this.display();
        };

        const pathEl = itemEl.createEl('span', { text: `${mapping.localPath} → ${mapping.remoteFilePath}`, cls: 'mapping-path' });
        if (!mapping.enabled) {
            pathEl.addClass('disabled');
        }

        const editBtn = itemEl.createEl('button', { text: 'Edit' });
        editBtn.onclick = () => this.enterEditMode(itemEl, mapping, pathEl, editBtn, deleteBtn);

        const deleteBtn = itemEl.createEl('button', { text: 'Delete' });
        deleteBtn.onclick = async () => {
            await this.plugin.fileMapper?.removeMapping(mapping.localPath);
            this.display();
        };
    }

    enterEditMode(itemEl: HTMLElement, mapping: FileMapping, pathEl: HTMLElement, editBtn: HTMLElement, deleteBtn: HTMLElement): void {
        const parts = mapping.localPath.split('→');
        const local = parts[0]?.trim() ?? '';
        const remote = parts[1]?.trim() ?? '';

        pathEl.empty();

        const localInput = pathEl.createEl('input', { type: 'text' });
        localInput.value = local;

        pathEl.createEl('span', { text: ' → ' });

        const remoteInput = pathEl.createEl('input', { type: 'text' });
        remoteInput.value = remote;

        editBtn.setText('Save');
        editBtn.onclick = async () => {
            const newLocal = localInput.value;
            const newRemote = remoteInput.value;
            if (newLocal && newRemote) {
                if (newLocal !== mapping.localPath) {
                    await this.plugin.fileMapper?.removeMapping(mapping.localPath);
                    await this.plugin.fileMapper?.addMapping(newLocal, newRemote);
                } else {
                    await this.plugin.fileMapper?.updateMapping(mapping.localPath, newRemote);
                }
                this.display();
            }
        };

        deleteBtn.setText('Cancel');
        deleteBtn.onclick = () => this.display();
    }

    createAddMappingSection(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName('Add new mapping')
            .addText(text => text
                .setPlaceholder('Local path (e.g., Notes/my-note.md)')
                .onChange((value: string) => {
                    this.addMappingState.localPathValue = value;
                }))
            .addText(text => text
                .setPlaceholder('Remote file path (e.g., content/english-notes.md)')
                .onChange((value: string) => {
                    this.addMappingState.remotePathValue = value;
                }))
            .addButton(btn => btn
                .setButtonText('Add')
                .onClick(async () => {
                    const localPath = this.addMappingState.localPathValue;
                    const remotePath = this.addMappingState.remotePathValue;
                    if (localPath && remotePath) {
                        await this.plugin.fileMapper?.addMapping(localPath, remotePath);
                        this.addMappingState = { localPathValue: '', remotePathValue: '' };
                        this.display();
                    }
                }));
    }
}
