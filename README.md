# Markdown Pro — Comment, Review, and Let AI Fix It

The missing link in AI-assisted writing workflows. Add inline comments to any Markdown file, then hand it back to an AI agent to review and address every note — all without leaving your editor.

![Extension Overview](screenshots/overview.png)

## Why This Exists

AI agents increasingly produce their output as Markdown — reports, documentation, plans, code specs. Reviewing that output means context-switching out of VS Code or resorting to clunky copy-paste loops.

**Markdown Pro** keeps the entire review loop inside the file:

1. **AI writes** a Markdown document
2. **You open it** in Markdown Pro and leave inline comments — on specific words, sentences, or entire sections
3. **You pass the file back** to the AI agent: *"Address all the comments in this file"*
4. **The AI reads your comments**, makes targeted edits, and removes the resolved annotations
5. Repeat until the document is exactly what you need

Comments are stored as standard HTML comment tags inside the `.md` file itself, so they are invisible to Markdown renderers but fully readable by any AI model.

```markdown
## Executive Summary

AI agents are transforming how teams produce written content.
<!-- MC:{"id":"c1","anchor":"transforming","comment":"Too vague — cite a specific metric or example"} -->

This approach reduces iteration time significantly.
<!-- MC:{"id":"c2","anchor":"","comment":"Needs a concrete number here. What does 'significantly' mean?"} -->
```

Pass that file to any AI with: *"Read the `<!-- MC: -->` comments and address each one in place."* The model sees every annotation in full context and can surgically update just the flagged content.

## Features

### Right-Aligned Comment Sidebar

All comments appear in a sidebar to the right of the content, each aligned to the exact line it annotates. When comments are close together, they stack automatically with a dotted connector line showing which line each belongs to.

### Inline Comments via Text Selection

Select any text in the preview and click the floating **Add Comment** button to attach a comment. The commented text is highlighted in yellow.

![Text Selection Comment](screenshots/select-comment.png)

### Line-Level Comments

Click any paragraph or block element to add a comment anchored to that line. A speech bubble icon marks the comment location.

![Line Comment](screenshots/line-comment.png)

### Pin All Comments Open

Toggle the **Comments** switch in the top-right corner to pin all comment cards open simultaneously — useful when reviewing an entire document at a glance or screenshotting annotated output for sharing.

### Portable, AI-Readable Storage

Comments live directly in your `.md` file as HTML comment tags — invisible in any standard Markdown renderer, but plain text for AI models:

```markdown
<!-- MC:{"id":"c1","anchor":"important details","comment":"Needs a citation"} -->
```

No sidecar files. No proprietary formats. The file is the source of truth.

## Getting Started

### Install from the Extensions Marketplace

1. Open VS Code
2. Press `Cmd+Shift+X` (macOS) or `Ctrl+Shift+X` (Windows/Linux) to open the Extensions panel
3. Search for **Markdown Pro Commenter**
4. Click **Install**

Or install directly from the command line:

```bash
code --install-extension amartyakhan.markdown-pro-commenter
```

### Install from VSIX

1. Download `markdown-pro-commenter-0.0.2.vsix`
2. In VS Code, press `Cmd+Shift+P` (macOS) or `Ctrl+Shift+P` (Windows/Linux)
3. Run **Extensions: Install from VSIX...**
4. Select the downloaded `.vsix` file

### Open a Markdown File

When you open a `.md` file, VS Code will offer **Markdown Commenter** as an editor option.

To set it as the default editor for Markdown files:

1. Right-click any `.md` file in the Explorer
2. Select **Open With...**
3. Choose **Markdown Commenter**
4. Click **Set as Default**

You can also open the commenter from:
- The comment icon in the editor title bar
- Right-click context menu in the Explorer or editor

## Usage

### Adding a Comment on Selected Text

1. Select text in the preview
2. Click the **Add Comment** button that appears below the selection
3. Type your comment
4. Press `Enter` or click **Save**

### Adding a Comment on a Line

1. Click anywhere on a paragraph (without selecting text)
2. Type your comment in the form that appears
3. Press `Enter` or click **Save**

### Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Save comment | `Enter` |
| New line in comment | `Shift+Enter` |
| Cancel | `Escape` |

### Reviewing with AI

Once you have annotated a document, pass it to any AI agent or chat interface with a prompt like:

> *"This Markdown file contains inline review comments formatted as `<!-- MC:{...} -->` HTML tags. Please address each comment, make the appropriate edits to the surrounding text, and remove the comment tags once resolved."*

Claude, ChatGPT, Gemini, and most other models handle this natively — they read the raw Markdown including the comment tags and can act on each one in context.

### Editing the Source Directly

Since comments are stored in the `.md` file, you can also edit or remove them in any text editor:

```
<!-- MC:{"id":"c1","anchor":"selected text","comment":"your comment"} -->
```

## Requirements

- Visual Studio Code 1.85.0 or later

## License

[MIT](LICENSE)
