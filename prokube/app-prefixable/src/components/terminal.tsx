import { onMount, onCleanup, createEffect } from "solid-js"
import { Terminal as XTerm } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import "@xterm/xterm/css/xterm.css"
import { useSDK } from "../context/sdk"

export interface TerminalProps {
  ptyId: string
  onClose?: () => void
}

export function Terminal(props: TerminalProps) {
  const { client, url, directory } = useSDK()
  let container!: HTMLDivElement
  let term: XTerm | undefined
  let fitAddon: FitAddon | undefined
  let ws: WebSocket | undefined

  onMount(() => {
    // Create terminal
    term = new XTerm({
      cursorBlink: true,
      cursorStyle: "bar",
      fontSize: 14,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      theme: {
        background: "#1a1a1a",
        foreground: "#d4d4d4",
        cursor: "#d4d4d4",
        selectionBackground: "rgba(255, 255, 255, 0.2)",
      },
      scrollback: 10000,
    })

    // Add fit addon
    fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    // Open terminal in container
    term.open(container)

    // Delay fit to ensure container is sized
    setTimeout(() => fitAddon?.fit(), 50)

    // Connect WebSocket
    const wsUrl =
      url.replace(/^http/, "ws") + `/pty/${props.ptyId}/connect?directory=${encodeURIComponent(directory || "")}`
    ws = new WebSocket(wsUrl)

    ws.addEventListener("open", () => {
      // Send initial size after a small delay to ensure terminal is fitted
      setTimeout(() => {
        if (term && ws?.readyState === WebSocket.OPEN) {
          client.pty
            .update({
              ptyID: props.ptyId,
              size: { cols: term.cols, rows: term.rows },
            })
            .catch(() => {})
        }
      }, 100)
    })

    ws.addEventListener("message", (event) => {
      term?.write(event.data)
    })

    ws.addEventListener("error", (e) => {
      console.error("[Terminal] WebSocket error:", e)
    })

    ws.addEventListener("close", (event) => {
      if (event.code !== 1000) {
        console.warn("[Terminal] WebSocket closed:", event.code, event.reason)
      }
    })

    // Send terminal input to WebSocket
    term.onData((data) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    })

    // Handle resize
    term.onResize((size) => {
      if (ws?.readyState === WebSocket.OPEN) {
        client.pty
          .update({
            ptyID: props.ptyId,
            size: { cols: size.cols, rows: size.rows },
          })
          .catch(() => {})
      }
    })

    // Window resize handler
    const handleResize = () => {
      setTimeout(() => fitAddon?.fit(), 10)
    }
    window.addEventListener("resize", handleResize)

    // Use ResizeObserver to detect container size changes
    const resizeObserver = new ResizeObserver(() => {
      setTimeout(() => fitAddon?.fit(), 10)
    })
    resizeObserver.observe(container)

    // Focus terminal
    term.focus()

    onCleanup(() => {
      window.removeEventListener("resize", handleResize)
      resizeObserver.disconnect()
      ws?.close()
      term?.dispose()
    })
  })

  return (
    <div
      ref={container}
      class="size-full"
      style={{
        background: "#1a1a1a",
        padding: "8px",
      }}
    />
  )
}
