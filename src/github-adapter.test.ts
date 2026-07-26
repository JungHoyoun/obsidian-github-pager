import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubAdapter } from "./github-adapter";

describe("GitHubAdapter", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("keeps retrying while a new commit graph is still propagating", async () => {
		vi.useFakeTimers();
		const adapter = Object.create(GitHubAdapter.prototype) as GitHubAdapter;
		const nonFastForward = Object.assign(new Error("Update is not a fast forward"), {
			status: 422,
		});
		const updateRef = vi
			.fn()
			.mockRejectedValueOnce(nonFastForward)
			.mockRejectedValueOnce(nonFastForward)
			.mockRejectedValueOnce(nonFastForward)
			.mockRejectedValueOnce(nonFastForward)
			.mockResolvedValue({ data: {} });
		const octokit = {
			repos: {
				getContent: vi.fn().mockResolvedValue({ data: { type: "file" } }),
			},
			git: {
				getRef: vi.fn().mockResolvedValue({ data: { object: { sha: "parent" } } }),
				getCommit: vi.fn().mockResolvedValue({ data: { tree: { sha: "base-tree" } } }),
				createBlob: vi.fn(),
				createTree: vi.fn().mockResolvedValue({ data: { sha: "next-tree" } }),
				createCommit: vi.fn().mockResolvedValue({ data: { sha: "next-commit" } }),
				updateRef,
			},
		};
		Object.defineProperties(adapter, {
			owner: { value: "owner" },
			repo: { value: "repo" },
			branch: { value: "main" },
		});
		Object.defineProperty(adapter, "octokit", { value: octokit });

		const result = adapter.applyChanges(
			[],
			["_posts/2026-07-27-test.md"],
			"Unpublish test from Obsidian",
		);
		await vi.runAllTimersAsync();

		await expect(result).resolves.toBe(true);
		expect(updateRef).toHaveBeenCalledTimes(5);
	});
});
