# GitHub Pager — secure Slip-box publisher

This fork publishes approved notes from Hoyoun's Obsidian Slip-box directly to
[`JungHoyoun/JungHoyoun.github.io`](https://github.com/JungHoyoun/JungHoyoun.github.io).
It does not require a local checkout of the website.

## Safety model

- Only Markdown files below `0. Slip-box/` are eligible.
- A note must have `share: true` plus valid `title`, `date`, and `slug` properties.
- The plugin may only write `_posts/` and `assets/img/posts/`.
- The GitHub token is selected through Obsidian SecretStorage and is never written to `data.json`.
- Automatic publishing is disabled by default and waits 10 quiet minutes when enabled.
- Removing `share: true` deletes the previously published post, but never deletes images.
- Deleting the local source note does not delete the remote post.
- There is no telemetry and no intermediary service.

Obsidian 1.11.5 or later is required. This fork is desktop-only.

## Note format

```yaml
---
share: true
published: false
title: Obsidian과 블로그 연결하기
date: 2026-07-26
slug: obsidian-blog-sync
description: 선택 사항
categories:
  - PKM
tags:
  - Obsidian
---
```

The plugin derives:

- `_posts/2026-07-26-obsidian-blog-sync.md`
- `/notes/obsidian-blog-sync/`
- `assets/img/posts/obsidian-blog-sync/<image>`

Set `published: false` for a build-only test. Change it to `true` to make the
post visible. Set `share: false`, or remove `share`, and save the note to remove
the post from GitHub.

## Setup

1. Update Obsidian to 1.11.5 or later.
2. Install `main.js`, `manifest.json`, and `styles.css` in
   `.obsidian/plugins/github-pager/`.
3. Enable **GitHub Pager** in **Settings → Community plugins**.
4. Create a fine-grained GitHub token limited to `JungHoyoun.github.io` with
   **Contents: Read and write**.
5. Add the token in Obsidian **Settings → Keychain**.
6. Open **Settings → GitHub Pager**, select the secret, and test the connection.
7. Keep automatic publishing off for the first `published: false` test.

## Commands

- **GitHub Pager: Test GitHub connection**
- **GitHub Pager: Publish or unpublish current note now**

## Development

```bash
npm ci
npm test
npm run build
```

Tags matching `manifest.json` build and publish the three Obsidian release
artifacts through GitHub Actions.
