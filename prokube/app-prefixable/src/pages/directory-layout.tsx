import { type ParentProps, createMemo, Show } from "solid-js"
import { useParams, Navigate } from "@solidjs/router"
import { SDKProvider } from "../context/sdk"
import { EventProvider } from "../context/events"
import { ProviderProvider } from "../context/providers"
import { MCPProvider } from "../context/mcp"
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
      return base64Decode(params.dir)
    } catch {
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
                <Layout>{props.children}</Layout>
              </MCPProvider>
            </ProviderProvider>
          </EventProvider>
        </SDKProvider>
      )}
    </Show>
  )
}
