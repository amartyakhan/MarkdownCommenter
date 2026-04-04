# Changelog

## [0.0.2] - 2026-04-04

### Changed
- Comments are now displayed in a right-aligned sidebar column instead of floating near their anchor elements
- Each comment card is vertically aligned to the exact source line it annotates
- When comments overlap vertically, they stack with a dotted connector line indicating the annotated line
- The add/edit comment form now opens in the sidebar rather than centered in the viewport

## [0.0.1] - 2026-04-03

### Added
- Initial release
- Live Markdown preview with inline comment annotations
- Add comments by clicking any line or selecting text
- Highlighted text anchors for selection-based comments
- Hover over a comment to view and edit it
- Edit and delete existing comments from a popover
- Toggle switch to pin all comment cards open simultaneously
- Comments stored inline in the Markdown file as `<!-- MC:{...} -->` tags, keeping files portable
- Custom editor registered for `.md` files (`priority: option`)
