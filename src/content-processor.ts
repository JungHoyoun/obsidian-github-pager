import { App, parseYaml, stringifyYaml, TFile } from "obsidian";
import {
	deriveImagePath,
	derivePermalink,
	deriveRemotePath,
	validatePublishMetadata,
} from "./publishing";
import { PUBLISH_TARGET } from "./settings";
import type { RemoteFile } from "./github-adapter";

export interface PublishPlan {
	slug: string;
	remotePath: string;
	files: RemoteFile[];
}

export class ContentProcessor {
	constructor(private readonly app: App) {}

	async buildPlan(file: TFile): Promise<PublishPlan> {
		const source = await this.app.vault.read(file);
		const frontmatterMatch = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?/.exec(source);
		if (!frontmatterMatch?.[1]) {
			throw new Error("Frontmatter is required.");
		}

		const frontmatter = parseYaml(frontmatterMatch[1]) as Record<string, unknown> | null;
		const validation = validatePublishMetadata(frontmatter ?? undefined);
		if (!validation.ok || !validation.metadata) {
			throw new Error(validation.errors.join("; "));
		}
		const metadata = validation.metadata;
		const files = new Map<string, RemoteFile>();
		let body = source.slice(frontmatterMatch[0].length);

		body = await this.transformImages(body, file, metadata.slug, files);
		body = this.transformWikiLinks(body, file);

		const outputFrontmatter: Record<string, unknown> = { ...(frontmatter ?? {}) };
		delete outputFrontmatter.share;
		delete outputFrontmatter.slug;
		delete outputFrontmatter.remote_path;
		outputFrontmatter.title = metadata.title;
		outputFrontmatter.date = frontmatter?.date;
		outputFrontmatter.published = metadata.published;
		outputFrontmatter.permalink = derivePermalink(metadata.slug);

		const remotePath = deriveRemotePath(metadata.date, metadata.slug, PUBLISH_TARGET.postsPath);
		const postContent = `---\n${stringifyYaml(outputFrontmatter).trimEnd()}\n---\n\n${body.trimStart()}`;
		files.set(remotePath, {
			path: remotePath,
			contentBase64: encodeUtf8(postContent),
		});

		return { slug: metadata.slug, remotePath, files: Array.from(files.values()) };
	}

	private async transformImages(
		content: string,
		sourceFile: TFile,
		slug: string,
		files: Map<string, RemoteFile>,
	): Promise<string> {
		const matches = Array.from(content.matchAll(/!\[\[([^\]]+)\]\]/g));
		for (const match of matches) {
			const fullMatch = match[0];
			const target = match[1];
			if (!target) continue;
			const [linkPath, altText] = target.split("|");
			if (!linkPath) continue;

			const imageFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, sourceFile.path);
			if (!(imageFile instanceof TFile)) {
				throw new Error(`Embedded image not found: ${linkPath}`);
			}

			const remotePath = deriveImagePath(slug, imageFile.name, PUBLISH_TARGET.imagePath);
			const binary = await this.app.vault.readBinary(imageFile);
			files.set(remotePath, { path: remotePath, contentBase64: arrayBufferToBase64(binary) });
			const publicPath = `/${remotePath.split("/").map(encodeURIComponent).join("/")}`;
			content = content.replace(fullMatch, `![${altText || imageFile.basename}](${publicPath})`);
		}
		return content;
	}

	private transformWikiLinks(content: string, sourceFile: TFile): string {
		return content.replace(/\[\[([^\]]+)\]\]/g, (_fullMatch: string, target: string) => {
			const [rawLinkPath, alias] = String(target).split("|");
			const [linkPath, heading] = (rawLinkPath ?? "").split("#");
			if (!linkPath) return alias ?? rawLinkPath ?? "";

			const linkedFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, sourceFile.path);
			const label = alias || linkedFile?.basename || linkPath;
			if (!(linkedFile instanceof TFile)) return label;

			const frontmatter = this.app.metadataCache.getFileCache(linkedFile)?.frontmatter as
				| Record<string, unknown>
				| undefined;
			if (frontmatter?.share !== true) return label;
			const validation = validatePublishMetadata(frontmatter);
			if (!validation.ok || !validation.metadata || !validation.metadata.published) return label;

			const anchor = heading ? `#${slugifyHeading(heading)}` : "";
			return `[${label}](${derivePermalink(validation.metadata.slug)}${anchor})`;
		});
	}
}

function encodeUtf8(value: string): string {
	return arrayBufferToBase64(new TextEncoder().encode(value).buffer);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function slugifyHeading(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s-]/gu, "")
		.replace(/\s+/g, "-");
}
