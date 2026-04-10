# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A VS Code extension ("Markdown Pro") that lets users add inline comments to Markdown files via a custom editor with live preview. Comments are stored as HTML comment tags (`<!-- MC:{...} -->`) directly in the `.md` file — invisible to renderers but readable by AI models.

The core use case is AI-assisted writing workflows: an AI generates a Markdown document, the human reviews it and leaves inline comments, then passes the annotated file back to the AI with instructions like "address all the `<!-- MC: -->` comments." This loop repeats until the document is right.

## Build Commands

- **Compile**: `npm run compile` (esbuild, outputs to `out/extension.js`)
- **Watch**: `npm run watch` (esbuild watch mode)
- **Package for publish**: `npm run vscode:prepublish` (esbuild with minification)
- **Package VSIX**: `npx @vscode/vsce package`
- **Publish**: `./publish.sh [patch|minor|major|x.y.z]` (reads tokens from `.env`, publishes to VS Code Marketplace and Open VSX)

No test framework is configured.

## Architecture

The extension has two layers: a Node.js extension host side and a webview (browser) side.

### Extension Host (`src/`)

- **extension.ts** — Entry point. Registers the `CustomTextEditorProvider` (priority `"option"`) and the `markdownCommenter.openPreview` command.
- **editorProvider.ts** — `MarkdownCommenterEditorProvider` implements `CustomTextEditorProvider`. Manages the webview lifecycle, relays document changes to the webview, and applies edits back to the document via `WorkspaceEdit`. Rewrites relative image paths to webview-safe URIs and injects Inter font `@font-face` declarations.
- **commentStore.ts** — Pure functions for comment CRUD on raw markdown strings. Parses `<!-- MC:{json} -->` tags, inserts/updates/deletes them, generates sequential IDs (`c1`, `c2`, ...), and strips comments for clean preview.
- **types.ts** — Shared types: `MCComment`, and the message protocols (`WebviewToExtensionMessage`, `ExtensionToWebviewMessage`).

### Webview (`media/`)

- **preview.js** — All webview UI logic (no framework). Uses `marked` for markdown→HTML rendering with custom renderers that inject `data-source-line` attributes. Handles text selection, comment popovers, sidebar toggle, and comment form interactions.
- **preview.css** — Styles for the preview pane, comment highlights, sidebar, and popups.
- **marked.min.js** — Bundled marked library (v17 UMD).
- **fonts/** — Inter font files (woff2).

### Data Flow

1. Extension reads document text → parses out MC comments → strips them → rewrites image paths → sends clean markdown + comments array to webview via `postMessage`.
2. Webview renders markdown with `marked`, then post-processes HTML to inject highlight spans and line markers for comments.
3. User interactions (add/edit/delete) send typed messages back to extension, which applies `WorkspaceEdit` to the underlying document. The document change event triggers a re-render cycle.

### Message Protocol (`types.ts`)

The webview ↔ extension boundary is typed. The webview sends `ready`, `addComment`, `editComment`, `deleteComment` messages. The extension sends a single `update` message containing the cleaned markdown string and the full comments array. All state lives in the document — the webview is stateless and re-renders on every `update`.

## Comment Storage Format

Comments are stored inline in the markdown file as: `<!-- MC:{"id":"c1","anchor":"selected text","comment":"user comment","line":5} -->`

The `anchor` field holds the selected text (empty for line-level comments). The `line` field is 1-indexed.

## Key Conventions

- The webview JS is plain ES5-style IIFE (`@ts-nocheck`) — no bundler, no modules.
- esbuild bundles only the extension host code; webview assets in `media/` are served as-is.
- CSP is strict: scripts require a nonce, images allow `https:` and `data:`, fonts require `webview.cspSource`.
- All edits use the full-document replace pattern (`edit.replace` with range 0..length).

## Design System

See [DESIGN.md](DESIGN.md) for the full visual specification ("The Blueprint Ledger"): color palette, typography (Inter), elevation rules, component styles, and do's/don'ts. Key constraints: 0px border-radius everywhere, no solid borders for sectioning (use tonal background shifts), `primary` (#0061a4) used sparingly for actionable intent only.
