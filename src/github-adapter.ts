import { Octokit } from "@octokit/rest";
import type { EndpointDefaults } from "@octokit/types";
import { retry } from "@octokit/plugin-retry";
import { throttling } from "@octokit/plugin-throttling";

const MyOctokit = Octokit.plugin(retry, throttling);

export class GitHubAdapter {
    octokit: Octokit;
    owner: string;
    repo: string;

    constructor(token: string, owner: string, repo: string) {
        this.owner = owner;
        this.repo = repo;
        this.octokit = new MyOctokit({
            auth: token,
            userAgent: 'obsidian-github-pager',
            throttle: {
                onRateLimit: (retryAfter: number, options: EndpointDefaults, octokit: Octokit) => {
                    if (options !== undefined) {
                        octokit.log.warn(`Request quota exhausted for request ${options.method} ${options.url}`);
                        if (options.request && options.request.retryCount < 3) {
                            octokit.log.info(`Retrying after ${retryAfter} seconds!`);
                            return true;
                        }
                    }
                    return false;
                },
                onSecondaryRateLimit: (retryAfter: number, options: EndpointDefaults, octokit: Octokit) => {
                    octokit.log.warn(`SecondaryRateLimit detected for request ${options.method} ${options.url}`);
                    return true;
                },
            },
        });
    }

    async verifyAuth(): Promise<string | null> {
        try {
            const { data } = await this.octokit.users.getAuthenticated();
            return data.login;
        } catch (e) {
            console.error("GitHub Auth Failed", e);
            return null;
        }
    }

    async pushFile(path: string, contentBase64: string, message: string): Promise<boolean> {
        try {
            let sha: string | undefined;
            try {
                const { data } = await this.octokit.repos.getContent({
                    owner: this.owner,
                    repo: this.repo,
                    path: path,
                });
                if (Array.isArray(data)) {
                    console.error("Path is a directory, not a file");
                    return false;
                }
                sha = data.sha;
            } catch (e: unknown) {
                const error = e as { status: number };
                if (error.status !== 404) {
                    throw e;
                }
            }

            await this.octokit.repos.createOrUpdateFileContents({
                owner: this.owner,
                repo: this.repo,
                path: path,
                message: message,
                content: contentBase64,
                sha: sha,
            });
            return true;
        } catch (e) {
            console.error("Push failed", e);
            return false;
        }
    }

    async getFileContent(path: string): Promise<string | null> {
        try {
            const { data } = await this.octokit.repos.getContent({
                owner: this.owner,
                repo: this.repo,
                path: path,
            });
            if (Array.isArray(data)) {
                return null;
            }
            const fileData = data as { content?: string };
            if (!fileData.content) {
                return null;
            }
            return Buffer.from(fileData.content, 'base64').toString('utf-8');
        } catch (e: unknown) {
            const error = e as { status: number };
            if (error.status === 404) {
                return null;
            }
            throw e;
        }
    }

    async hasChanges(path: string, localContentBase64: string): Promise<boolean> {
        const remoteContent = await this.getFileContent(path);
        if (remoteContent === null) return true;

        const remoteBase64 = Buffer.from(remoteContent).toString('base64');
        return remoteBase64 !== localContentBase64;
    }

    async pushFilesBatch(files: { path: string; contentBase64: string }[], message: string, branch = 'main', retries = 3): Promise<boolean> {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                // 1. Try to get the specified branch, fallback to repository default branch
                let targetBranch = branch;
                try {
                    await this.octokit.git.getRef({
                        owner: this.owner,
                        repo: this.repo,
                        ref: `heads/${branch}`,
                    });
                } catch (e: unknown) {
                    const error = e as { status: number };
                    if (error.status === 422) {
                        // Branch doesn't exist, try to get repository default branch
                        const { data: repoData } = await this.octokit.repos.get({
                            owner: this.owner,
                            repo: this.repo,
                        });
                        targetBranch = repoData.default_branch;
                        console.log(`Branch "${branch}" not found, using default branch "${targetBranch}"`);
                    } else {
                        throw e;
                    }
                }

                // 2. Get current HEAD commit
                const { data: refData } = await this.octokit.git.getRef({
                    owner: this.owner,
                    repo: this.repo,
                    ref: `heads/${targetBranch}`,
                });
                const parentCommitSha = refData.object.sha;

                // 3. Get current commit's tree
                const { data: commitData } = await this.octokit.git.getCommit({
                    owner: this.owner,
                    repo: this.repo,
                    commit_sha: parentCommitSha,
                });
                const baseTreeSha = commitData.tree.sha;

                // 4. Create blobs for each file
                const treeItems = [];
                for (const file of files) {
                    const { data: blobData } = await this.octokit.git.createBlob({
                        owner: this.owner,
                        repo: this.repo,
                        content: file.contentBase64,
                        encoding: 'base64',
                    });
                    treeItems.push({
                        path: file.path,
                        mode: '100644' as const,
                        type: 'blob' as const,
                        sha: blobData.sha,
                    });
                }

                // 5. Create new tree
                const { data: newTreeData } = await this.octokit.git.createTree({
                    owner: this.owner,
                    repo: this.repo,
                    base_tree: baseTreeSha,
                    tree: treeItems,
                });

                // 6. Create commit with new tree
                const { data: newCommitData } = await this.octokit.git.createCommit({
                    owner: this.owner,
                    repo: this.repo,
                    message: message,
                    tree: newTreeData.sha,
                    parents: [parentCommitSha],
                });

                // 7. Update HEAD to new commit
                await this.octokit.git.updateRef({
                    owner: this.owner,
                    repo: this.repo,
                    ref: `heads/${targetBranch}`,
                    sha: newCommitData.sha,
                });

                return true;
            } catch (e: unknown) {
                const error = e as { status?: number; message?: string };
                console.error(`Batch push attempt ${attempt + 1} failed:`, error);

                if (attempt === retries) {
                    // Final attempt failed, return detailed error
                    console.error(`Batch push failed after ${retries + 1} attempts:`, e);
                    return false;
                }

                // Wait before retry (exponential backoff: 1s, 2s, 4s)
                const delay = Math.pow(2, attempt) * 1000;
                console.log(`Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        return false;
    }
}
