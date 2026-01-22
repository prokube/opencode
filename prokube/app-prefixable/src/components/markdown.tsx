import { createMemo } from "solid-js"
import { marked } from "marked"

// Configure marked for safe rendering
marked.setOptions({
  gfm: true,
  breaks: true,
})

interface MarkdownProps {
  content: string
  class?: string
}

export function Markdown(props: MarkdownProps) {
  const html = createMemo(() => {
    if (!props.content) return ""
    return marked.parse(props.content, { async: false }) as string
  })

  return <div class={`markdown-content ${props.class || ""}`} innerHTML={html()} />
}
