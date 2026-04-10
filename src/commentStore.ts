import { MCComment } from './types';

// Matches: <!-- MC:{...} -->
const MC_REGEX = /<!--\s*MC:(\{.*?\})\s*-->/gs;

export function parseComments(source: string): MCComment[] {
  const results: MCComment[] = [];
  MC_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MC_REGEX.exec(source)) !== null) {
    try {
      const comment = JSON.parse(match[1]) as MCComment;
      results.push(comment);
    } catch {
      // skip malformed JSON
    }
  }
  return results;
}

export function insertComment(
  source: string,
  comment: MCComment,
  afterLine: number
): string {
  const lines = source.split('\n');
  let insertIndex = Math.max(0, Math.min(afterLine, lines.length));

  // If inserting inside a table block, move to after the table ends
  while (insertIndex < lines.length && isTableLine(lines[insertIndex])) {
    insertIndex++;
  }

  const tag = `<!-- MC:${JSON.stringify(comment)} -->`;
  lines.splice(insertIndex, 0, tag);
  return lines.join('\n');
}

export function isTableLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|');
}

export function deleteComment(source: string, id: string): string {
  // Escape id for use in regex (ids are alphanumeric so this is safe)
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match the entire line containing this comment tag
  const pattern = new RegExp(
    `^<!--\\s*MC:\\{[^}]*"id":"${escapedId}"[^}]*\\}\\s*-->\\r?\\n?`,
    'gm'
  );
  return source.replace(pattern, '');
}

export function updateComment(source: string, id: string, newComment: string): string {
  return source.replace(/<!--\s*MC:(\{.*?\})\s*-->/gs, (match, json) => {
    try {
      const obj = JSON.parse(json) as MCComment;
      if (obj.id === id) {
        obj.comment = newComment;
        return `<!-- MC:${JSON.stringify(obj)} -->`;
      }
    } catch {
      // skip malformed
    }
    return match;
  });
}

export function generateId(existingComments: MCComment[]): string {
  let max = 0;
  for (const c of existingComments) {
    const m = c.id.match(/^c(\d+)$/);
    if (m) {
      max = Math.max(max, parseInt(m[1], 10));
    }
  }
  return `c${max + 1}`;
}

export function stripComments(source: string): string {
  MC_REGEX.lastIndex = 0;
  return source.replace(/<!--\s*MC:\{.*?\}\s*-->\r?\n?/gs, '');
}
