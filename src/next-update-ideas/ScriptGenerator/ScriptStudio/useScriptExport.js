import { useCallback } from 'react'

const MARKER_RE = /\[(B-ROLL|ON-SCREEN TEXT|PAUSE|SFX|CUT)(?::\s*([^\]]*))?\]/gi

function strip(text) {
  return text
    .replace(MARKER_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function sectionsToPlainText(sections, title, viewMode) {
  const lines = [`${title}\n${'='.repeat(title.length)}\n`]
  for (const s of sections) {
    const heading = `--- ${s.id}${s.title ? `: ${s.title}` : ''} ---`
    const body = viewMode === 'text' ? strip(s.text) : s.text
    lines.push(`${heading}\n\n${body}\n`)
  }
  return lines.join('\n')
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function useScriptExport() {
  const exportTxt = useCallback((sections, title, viewMode) => {
    const text = sectionsToPlainText(sections, title || 'Script', viewMode)
    downloadBlob(
      text,
      `${(title || 'script')
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .trim()
        .replace(/\s+/g, '-')}.txt`,
      'text/plain;charset=utf-8'
    )
  }, [])

  const exportPdf = useCallback(async (sections, title, viewMode) => {
    const { default: html2pdf } = await import('html2pdf.js')
    const el = document.createElement('div')
    el.style.cssText =
      'font-family:system-ui,sans-serif;color:#1a1a2e;max-width:700px;padding:24px;'
    el.innerHTML = `<h1 style="font-size:20px;margin:0 0 16px;">${title || 'Script'}</h1>`
    for (const s of sections) {
      const body =
        viewMode === 'text'
          ? strip(s.text)
          : s.text.replace(
              MARKER_RE,
              (_, kind, detail) =>
                `<mark style="background:#e0e7ff;border-radius:4px;padding:1px 4px;font-size:0.85em;">[${kind}${detail ? ': ' + detail : ''}]</mark>`
            )
      el.innerHTML += `<h3 style="font-size:13px;color:#6366f1;margin:18px 0 6px;text-transform:uppercase;letter-spacing:0.05em;">${s.id}${s.title ? ' — ' + s.title : ''}</h3><p style="font-size:14px;line-height:1.65;margin:0 0 8px;white-space:pre-wrap;">${body}</p>`
    }
    html2pdf()
      .set({
        margin: [12, 14],
        filename: `${(title || 'script')
          .replace(/[^a-zA-Z0-9 ]/g, '')
          .trim()
          .replace(/\s+/g, '-')}.pdf`,
        html2canvas: { scale: 2 },
        jsPDF: { format: 'a4' },
      })
      .from(el)
      .save()
  }, [])

  const exportDocx = useCallback(async (sections, title, viewMode) => {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx')
    const { saveAs } = await import('file-saver')
    const children = [new Paragraph({ text: title || 'Script', heading: HeadingLevel.HEADING_1 })]
    for (const s of sections) {
      children.push(
        new Paragraph({
          text: `${s.id}${s.title ? ` — ${s.title}` : ''}`,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300 },
        })
      )
      const body = viewMode === 'text' ? strip(s.text) : s.text
      for (const para of body.split('\n').filter(Boolean)) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: para, size: 24 })],
            spacing: { after: 120 },
          })
        )
      }
    }
    const doc = new Document({ sections: [{ children }] })
    const blob = await Packer.toBlob(doc)
    saveAs(
      blob,
      `${(title || 'script')
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .trim()
        .replace(/\s+/g, '-')}.docx`
    )
  }, [])

  return { exportTxt, exportPdf, exportDocx }
}
