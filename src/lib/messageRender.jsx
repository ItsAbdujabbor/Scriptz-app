/**
 * Shared message rendering utilities used by CoachChat, ScriptGenerator,
 * and ThumbnailGenerator so all three screens render assistant messages
 * identically (markdown paragraphs, lists, tables, code blocks, inline
 * bold/italic/code). Extracted verbatim from CoachChat.jsx so Coach's
 * behavior is unchanged.
 */

export function normalizeMessageText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\\n/g, '\n')
    .trim()
}

/**
 * Extracts follow-up questions from the <<<FOLLOWUP>>>...<<<END>>> block.
 * Returns { cleanText, followUps: string[] }.
 */
export function parseFollowUps(text) {
  const raw = String(text || '')
  const startTag = '<<<FOLLOWUP>>>'
  const endTag = '<<<END>>>'
  const startIndex = raw.indexOf(startTag)
  if (startIndex === -1) return { cleanText: raw, followUps: [] }

  const afterStart = startIndex + startTag.length
  const endIndex = raw.indexOf(endTag, afterStart)
  const block = endIndex !== -1 ? raw.slice(afterStart, endIndex) : raw.slice(afterStart)

  const followUps = block
    .split('\n')
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter((line) => line.length > 0 && line.length < 120)

  const cleanText = raw.slice(0, startIndex).trimEnd()
  return { cleanText, followUps }
}

function renderInlineText(text, keyPrefix) {
  const source = String(text || '')
  if (!source) return null

  const parts = source.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean)
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`
    if (/^`[^`]+`$/.test(part)) {
      return <code key={key}>{part.slice(1, -1)}</code>
    }
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={key}>{part.slice(2, -2)}</strong>
    }
    if (/^\*[^*]+\*$/.test(part)) {
      return <em key={key}>{part.slice(1, -1)}</em>
    }
    return <span key={key}>{part}</span>
  })
}

function renderParagraphLines(text, keyPrefix) {
  return String(text || '')
    .split('\n')
    .map((line, index) => (
      <span key={`${keyPrefix}-line-${index}`}>
        {renderInlineText(line, `${keyPrefix}-inline-${index}`)}
        {index < String(text || '').split('\n').length - 1 ? <br /> : null}
      </span>
    ))
}

function parseTableRow(line) {
  return String(line || '')
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

export function renderMessageContent(text, keyPrefix, streaming = false) {
  const normalized = normalizeMessageText(text)
  if (!normalized) return null

  const lines = normalized.split('\n')
  const blocks = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      index += 1
      continue
    }

    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim()
      index += 1
      const codeLines = []
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({
        type: 'code',
        language,
        content: codeLines.join('\n'),
      })
      continue
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      const level = Math.min(trimmed.match(/^#+/)?.[0].length || 1, 6)
      blocks.push({
        type: 'heading',
        level,
        content: trimmed.replace(/^#{1,6}\s+/, ''),
      })
      index += 1
      continue
    }

    if (/^(\*\s*){3,}$/.test(trimmed) || /^(-\s*){3,}$/.test(trimmed)) {
      blocks.push({ type: 'rule' })
      index += 1
      continue
    }

    if (
      trimmed.includes('|') &&
      index + 1 < lines.length &&
      /^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(lines[index + 1])
    ) {
      const header = parseTableRow(lines[index])
      index += 2
      const rows = []
      while (index < lines.length && lines[index].trim().includes('|')) {
        rows.push(parseTableRow(lines[index]))
        index += 1
      }
      blocks.push({ type: 'table', header, rows })
      continue
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items = []
      while (index < lines.length && /^[-*+]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*+]\s+/, ''))
        index += 1
      }
      blocks.push({ type: 'list', ordered: false, items })
      continue
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items = []
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ''))
        index += 1
      }
      blocks.push({ type: 'list', ordered: true, items })
      continue
    }

    const paragraphLines = [line]
    index += 1
    while (index < lines.length) {
      const next = lines[index]
      const nextTrimmed = next.trim()
      if (
        !nextTrimmed ||
        nextTrimmed.startsWith('```') ||
        /^#{1,6}\s+/.test(nextTrimmed) ||
        /^(\*\s*){3,}$/.test(nextTrimmed) ||
        /^(-\s*){3,}$/.test(nextTrimmed) ||
        /^[-*+]\s+/.test(nextTrimmed) ||
        /^\d+\.\s+/.test(nextTrimmed)
      ) {
        break
      }
      if (
        nextTrimmed.includes('|') &&
        index + 1 < lines.length &&
        /^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(lines[index + 1])
      ) {
        break
      }
      paragraphLines.push(next)
      index += 1
    }

    blocks.push({
      type: 'paragraph',
      content: paragraphLines.join('\n').trim(),
    })
  }

  return blocks.map((block, blockIndex) => {
    const key = `${keyPrefix}-block-${blockIndex}`
    let element = null

    if (block.type === 'heading') {
      const Tag = `h${block.level}`
      element = <Tag key={key}>{renderInlineText(block.content, `${key}-inline`)}</Tag>
    } else if (block.type === 'paragraph') {
      element = <p key={key}>{renderParagraphLines(block.content, key)}</p>
    } else if (block.type === 'rule') {
      element = <hr key={key} />
    } else if (block.type === 'list') {
      const ListTag = block.ordered ? 'ol' : 'ul'
      element = (
        <ListTag key={key}>
          {block.items.map((item, itemIndex) => (
            <li key={`${key}-item-${itemIndex}`}>
              {renderInlineText(item, `${key}-item-${itemIndex}`)}
            </li>
          ))}
        </ListTag>
      )
    } else if (block.type === 'code') {
      element = (
        <pre key={key} className="coach-code-block">
          {block.language ? <span className="coach-code-language">{block.language}</span> : null}
          <code>{block.content}</code>
        </pre>
      )
    } else if (block.type === 'table') {
      element = (
        <div key={key} className="coach-table-wrap">
          <table className="coach-table">
            <thead>
              <tr>
                {block.header.map((cell, cellIndex) => (
                  <th key={`${key}-head-${cellIndex}`}>
                    {renderInlineText(cell, `${key}-head-${cellIndex}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={`${key}-row-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${key}-cell-${rowIndex}-${cellIndex}`}>
                      {renderInlineText(cell, `${key}-cell-${rowIndex}-${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    if (!element) return null
    if (streaming) {
      return (
        <div key={key} className="coach-stream-block">
          {element}
        </div>
      )
    }
    return element
  })
}
