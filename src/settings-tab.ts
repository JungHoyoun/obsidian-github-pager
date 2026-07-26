import { App, PluginSettingTab, SecretComponent, Setting } from "obsidian";
import GitHubPagerPlugin from "./main";
import { PUBLISH_TARGET } from "./settings";

export class GitHubPagerSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: GitHubPagerPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("GitHub token")
			.setDesc("Select a SecretStorage entry with Contents read/write access to JungHoyoun.github.io.")
			.addComponent((element) =>
				new SecretComponent(this.app, element)
					.setValue(this.plugin.settings.githubTokenSecretId)
					.onChange(async (value) => {
						this.plugin.settings.githubTokenSecretId = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Publish target")
			.setDesc(
				`${PUBLISH_TARGET.owner}/${PUBLISH_TARGET.repository}:${PUBLISH_TARGET.branch} · ${PUBLISH_TARGET.sourceRoot}`,
			);

		new Setting(containerEl)
			.setName("Automatic publishing")
			.setDesc('Publish eligible notes after they remain unchanged. Disable this during initial testing.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoSync).onChange(async (value) => {
					this.plugin.settings.autoSync = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Quiet period")
			.setDesc("Minutes without edits before automatic publishing.")
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.debounceMinutes))
					.onChange(async (value) => {
						const parsed = Number.parseInt(value, 10);
						if (Number.isFinite(parsed) && parsed >= 1) {
							this.plugin.settings.debounceMinutes = parsed;
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(containerEl).addButton((button) =>
			button.setButtonText("Test connection").onClick(async () => {
				const user = await this.plugin.testConnection();
				button.setButtonText(user ? `Connected: ${user}` : "Connection failed");
			}),
		);
	}
}
