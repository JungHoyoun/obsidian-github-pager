export interface PublishMetadata {
	title: string;
	date: string;
	slug: string;
	published: boolean;
}

export interface MetadataValidation {
	ok: boolean;
	errors: string[];
	metadata?: PublishMetadata;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/;

export function isWithinSourceRoot(path: string, sourceRoot: string): boolean {
	const normalizedRoot = sourceRoot.endsWith("/") ? sourceRoot : `${sourceRoot}/`;
	return path.startsWith(normalizedRoot) && path.toLowerCase().endsWith(".md");
}

export function validatePublishMetadata(frontmatter: Record<string, unknown> | undefined): MetadataValidation {
	const errors: string[] = [];
	const title = typeof frontmatter?.title === "string" ? frontmatter.title.trim() : "";
	const slug = typeof frontmatter?.slug === "string" ? frontmatter.slug.trim() : "";
	const rawDate = frontmatter?.date;
	const dateText = rawDate instanceof Date
		? rawDate.toISOString()
		: typeof rawDate === "string"
			? rawDate.trim()
			: "";
	const dateMatch = DATE_PATTERN.exec(dateText);

	if (!title) errors.push("title is required");
	if (!dateMatch?.[1]) errors.push("date must start with YYYY-MM-DD");
	if (!slug) {
		errors.push("slug is required");
	} else if (!SLUG_PATTERN.test(slug)) {
		errors.push("slug must contain only lowercase letters, numbers, and single hyphens");
	}

	if (errors.length > 0 || !dateMatch?.[1]) {
		return { ok: false, errors };
	}

	return {
		ok: true,
		errors: [],
		metadata: {
			title,
			date: dateMatch[1],
			slug,
			published: frontmatter?.published !== false,
		},
	};
}

export function deriveRemotePath(date: string, slug: string, postsPath: string): string {
	return `${trimSlashes(postsPath)}/${date}-${slug}.md`;
}

export function derivePermalink(slug: string): string {
	return `/notes/${slug}/`;
}

export function deriveImagePath(slug: string, filename: string, imagePath: string): string {
	return `${trimSlashes(imagePath)}/${slug}/${filename}`;
}

export function isAllowedPostPath(path: string, postsPath: string): boolean {
	return path.startsWith(`${trimSlashes(postsPath)}/`) && path.endsWith(".md");
}

export function isAllowedImagePath(path: string, imagePath: string): boolean {
	return path.startsWith(`${trimSlashes(imagePath)}/`);
}

function trimSlashes(path: string): string {
	return path.replace(/^\/+/, "").replace(/\/+$/, "");
}
