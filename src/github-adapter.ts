import { Octokit } from "@octokit/rest";
import type { EndpointDefaults } from "@octokit/types";
import { retry } from "@octokit/plugin-retry";
import { throttling } from "@octokit/plugin-throttling";

const MyOctokit = Octokit.plugin(retry, throttling);

export interface RemoteFile {
	path: string;
	contentBase64: string;
}

export class GitHubAdapter {
	private readonly octokit: Octokit;

	constructor(
		token: string,
		private readonly owner: string,
		private readonly repo: string,
		private readonly branch: string,
	) {
		this.octokit = new MyOctokit({
			auth: token,
			userAgent: "obsidian-github-pager",
			throttle: {
				onRateLimit: (retryAfter: number, options: EndpointDefaults, octokit: Octokit) => {
					octokit.log.warn(`Rate limit for ${options.method} ${options.url}`);
					if (options.request && options.request.retryCount < 3) {
						octokit.log.info(`Retrying after ${retryAfter} seconds`);
						return true;
					}
					return false;
				},
				onSecondaryRateLimit: (_retryAfter: number, options: EndpointDefaults, octokit: Octokit) => {
					octokit.log.warn(`Secondary rate limit for ${options.method} ${options.url}`);
					return true;
				},
			},
		});
	}

	async verifyAuth(): Promise<string | null> {
		try {
			const { data } = await this.octokit.users.getAuthenticated();
			return data.login;
		} catch (error) {
			console.error("GitHub authentication failed", error);
			return null;
		}
	}

	async hasChanges(path: string, contentBase64: string): Promise<boolean> {
		try {
			const { data } = await this.octokit.repos.getContent({
				owner: this.owner,
				repo: this.repo,
				path,
				ref: this.branch,
			});
			if (Array.isArray(data) || data.type !== "file" || !("content" in data)) return true;
			return data.content.replace(/\s/g, "") !== contentBase64.replace(/\s/g, "");
		} catch (error) {
			if (isStatus(error, 404)) return true;
			throw error;
		}
	}

	async applyChanges(
		files: RemoteFile[],
		deletePaths: string[],
		message: string,
		retries = 3,
	): Promise<boolean> {
		const changedFiles: RemoteFile[] = [];
		for (const file of files) {
			if (await this.hasChanges(file.path, file.contentBase64)) changedFiles.push(file);
		}
		const existingDeletePaths: string[] = [];
		for (const path of deletePaths) {
			if (await this.fileExists(path)) existingDeletePaths.push(path);
		}
		if (changedFiles.length === 0 && existingDeletePaths.length === 0) return false;

		for (let attempt = 0; attempt <= retries; attempt += 1) {
			try {
				const { data: refData } = await this.octokit.git.getRef({
					owner: this.owner,
					repo: this.repo,
					ref: `heads/${this.branch}`,
				});
				const parentCommitSha = refData.object.sha;
				const { data: commitData } = await this.octokit.git.getCommit({
					owner: this.owner,
					repo: this.repo,
					commit_sha: parentCommitSha,
				});

				const treeItems: Array<{
					path: string;
					mode: "100644";
					type: "blob";
					sha: string | null;
				}> = [];

				for (const file of changedFiles) {
					const { data: blob } = await this.octokit.git.createBlob({
						owner: this.owner,
						repo: this.repo,
						content: file.contentBase64,
						encoding: "base64",
					});
					treeItems.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
				}
				for (const path of existingDeletePaths) {
					treeItems.push({ path, mode: "100644", type: "blob", sha: null });
				}

				const { data: tree } = await this.octokit.git.createTree({
					owner: this.owner,
					repo: this.repo,
					base_tree: commitData.tree.sha,
					tree: treeItems,
				});
				const { data: commit } = await this.octokit.git.createCommit({
					owner: this.owner,
					repo: this.repo,
					message,
					tree: tree.sha,
					parents: [parentCommitSha],
				});
				await this.octokit.git.updateRef({
					owner: this.owner,
					repo: this.repo,
					ref: `heads/${this.branch}`,
					sha: commit.sha,
				});
				return true;
			} catch (error) {
				if (attempt === retries) throw error;
				await delay(2 ** attempt * 1000);
			}
		}
		return false;
	}

	private async fileExists(path: string): Promise<boolean> {
		try {
			await this.octokit.repos.getContent({
				owner: this.owner,
				repo: this.repo,
				path,
				ref: this.branch,
			});
			return true;
		} catch (error) {
			if (isStatus(error, 404)) return false;
			throw error;
		}
	}
}

function isStatus(error: unknown, status: number): boolean {
	return typeof error === "object" && error !== null && "status" in error && error.status === status;
}

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
