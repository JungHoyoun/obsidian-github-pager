# GitHub Pager

Treat Obsidian as a Headless CMS. Selectively publish notes and images to a GitHub repository, compatible with Hugo, Jekyll, Hexo, and other static site generators.

## Features

- **Selective Sync via Mapping Table**: Manage a mapping between local vault files and remote GitHub paths in plugin settings.
- **Flexible Remote Paths**: Remote filenames can differ from local ones (e.g., local `Notes/中文笔记.md` → remote `content/english-notes.md`).
- **Batch Sync**: Sync all mapped files in a single Git commit.
- **Smart Change Detection**: Skips pushing files when content hasn't changed.
- **Auto-Sync**: Automatically pushes changes when you save a mapped file or a file with `share: true` frontmatter.
- **Backward Compatible**: Falls back to `remote_path` frontmatter if no mapping exists.
- **Link Transformation**: Converts `[[WikiLinks]]` to standard `[Markdown Links](/path/to/note.md)`.
- **Image Handling**: Automatically uploads embedded images `![[image.png]]` to a dedicated folder and rewrites links.

## Installation

1. Clone this repository.
2. Run `npm install` to install dependencies.
3. Run `npm run build` to build the plugin.
4. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/obsidian-github-pager/` folder.
5. Enable the plugin in Obsidian Settings.

## Configuration

Go to **Settings > Obsidian GitHub Pager** and configure:

- **GitHub Token**: A Personal Access Token (PAT) with `repo` scope. See [Creating a personal access token](https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token). Ensure the token has access to the target repository with content write permissions.
- **Repository Owner**: Your GitHub username or organization.
- **Repository Name**: The name of the destination repository.
- **Base Path**: Default folder in the repo where notes should be saved (e.g., `content/posts`). Used as fallback when no mapping exists.
- **Image Path**: Folder in the repo where images should be saved (e.g., `static/images`).
- **Commit Message**: Template for commit messages (use `{{file}}` to include the filename).
- **Auto Sync**: Enable to push changes automatically when you save a mapped file or a file with `share: true` frontmatter.
- **Default Branch**: The branch for batch commits. Usually `main` or `master`.

## Usage

### File Mapping Table

The plugin maintains a mapping table to control which files sync to which remote paths.

1. Open **Settings > Obsidian GitHub Pager > File Mappings**.
2. Click **Add** to create a new mapping.
3. Enter the **Local path** (e.g., `Notes/my-note.md`) and **Remote file path** (e.g., `content/my-english-note.md`).

The remote path can be:
- A **full file path** with extension (e.g., `content/notes.md`) — the file will be saved with that exact name.
- A **directory path** (e.g., `content/posts`) — the file will be saved with its local filename in that directory.

### Sync Operations

- **Sync Single File**: Right-click a file in the file explorer and select **Sync to GitHub**, or use the command palette: `Push Current File to GitHub`.
- **Sync All Mapped Files**: Run `Sync all mapped files to GitHub` from the command palette. All enabled mappings are synced in a **single Git commit**.
- **Auto-Sync**: When enabled, any modification to a mapped file (or a file with `share: true` frontmatter) triggers an automatic sync.

### Change Detection

Before pushing, the plugin compares file content with the remote. If content is unchanged, the push is skipped, avoiding empty commits.

### Backward Compatibility

If a file has no mapping but has `remote_path` in its frontmatter, the plugin falls back to that path. Similarly, if a file has `share: true` but no mapping or frontmatter path, the default `Base Path` is used.

## Commands

| Command | Description |
|---------|-------------|
| Push Current File to GitHub | Sync the currently active file |
| Sync all mapped files to GitHub | Batch sync all enabled mappings in one commit |
| Test GitHub connection | Verify your GitHub token is valid |

## Troubleshooting

- Check the Obsidian console (`Ctrl+Shift+I`) for logs and error messages.
- Ensure your GitHub token has `repo` scope and write permissions to the target repository.
- If batch sync fails, check that the default branch exists and is correct.
