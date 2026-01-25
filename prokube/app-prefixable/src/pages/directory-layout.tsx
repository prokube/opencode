import { type ParentProps, createMemo, Show } from "solid-js"
import { useParams, Navigate } from "@solidjs/router"
import { SDKProvider } from "../context/sdk"
import { EventProvider } from "../context/events"
import { ProviderProvider } from "../context/providers"
import { MCPProvider } from "../context/mcp"
import { TerminalProvider } from "../context/terminal"
import { base64Decode } from "../utils/path"
import { Layout } from "./layout"

/**
 * Wraps routes that need a directory context.
 * Extracts the base64-encoded directory from the URL and provides SDK context.
 */
export function DirectoryLayout(props: ParentProps) {
  const params = useParams<{ dir: string }>()

  const directory = createMemo(() => {
    try {
      const decoded = base64Decode(params.dir)
      // Validate the decoded path looks reasonable (starts with / or ~)
      if (decoded && (decoded.startsWith("/") || decoded.startsWith("~"))) {
        return decoded
      }
      console.error("[DirectoryLayout] Invalid decoded path:", decoded)
      return undefined
    } catch (e) {
      console.error("[DirectoryLayout] Failed to decode directory:", params.dir, e)
      return undefined
    }
  })

  return (
    <Show when={directory()} fallback={<Navigate href="/" />}>
      {(dir) => (
        <SDKProvider directory={dir()}>
          <EventProvider>
            <ProviderProvider>
              <MCPProvider>
                <TerminalProvider>
                  <Layout>{props.children}</Layout>
                </TerminalProvider>
              </MCPProvider>
            </ProviderProvider>
          </EventProvider>
        </SDKProvider>
      )}
    </Show>
  )
}
