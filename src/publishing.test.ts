import { describe, expect, it } from "vitest";
import {
	deriveImagePath,
	derivePermalink,
	deriveRemotePath,
	isAllowedImagePath,
	isAllowedPostPath,
	isWithinSourceRoot,
	validatePublishMetadata,
} from "./publishing";

describe("publishing rules", () => {
	it("accepts complete metadata and derives stable Jekyll paths", () => {
		const result = validatePublishMetadata({
			title: "테스트 글",
			date: "2026-07-26 10:30:00 +0900",
			slug: "obsidian-blog",
			published: false,
		});

		expect(result.ok).toBe(true);
		expect(result.metadata).toEqual({
			title: "테스트 글",
			date: "2026-07-26",
			slug: "obsidian-blog",
			published: false,
		});
		expect(deriveRemotePath("2026-07-26", "obsidian-blog", "_posts")).toBe(
			"_posts/2026-07-26-obsidian-blog.md",
		);
		expect(derivePermalink("obsidian-blog")).toBe("/notes/obsidian-blog/");
	});

	it("rejects missing or unsafe metadata", () => {
		const result = validatePublishMetadata({
			title: "",
			date: "26-07-2026",
			slug: "한글 Slug",
		});

		expect(result.ok).toBe(false);
		expect(result.errors).toHaveLength(3);
	});

	it("limits source and remote paths", () => {
		expect(isWithinSourceRoot("0. Slip-box/post.md", "0. Slip-box/")).toBe(true);
		expect(isWithinSourceRoot("2. Area/post.md", "0. Slip-box/")).toBe(false);
		expect(isAllowedPostPath("_posts/2026-07-26-post.md", "_posts")).toBe(true);
		expect(isAllowedPostPath("_config.yml", "_posts")).toBe(false);
		expect(deriveImagePath("post", "image.png", "assets/img/posts")).toBe(
			"assets/img/posts/post/image.png",
		);
		expect(isAllowedImagePath("assets/img/posts/post/image.png", "assets/img/posts")).toBe(true);
	});
});
