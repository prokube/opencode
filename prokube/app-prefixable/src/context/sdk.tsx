import { createContext, useContext, type ParentProps } from "solid-js"
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"
import { useBasePath } from "./base-path"

type SDKClient = ReturnType<typeof createOpencodeClient>

interface SDKContextValue {
  client: SDKClient
  url: string
  directory?: string
}

const SDKContext = createContext<SDKContextValue>()

export function SDKProvider(props: ParentProps & { directory?: string }) {
  const { serverUrl } = useBasePath()

  const client = createOpencodeClient({
    baseUrl: serverUrl,
    directory: props.directory,
    throwOnError: true,
  })

  return (
    <SDKContext.Provider value={{ client, url: serverUrl, directory: props.directory }}>
      {props.children}
    </SDKContext.Provider>
  )
}

export function useSDK() {
  const ctx = useContext(SDKContext)
  if (!ctx) throw new Error("useSDK must be used within SDKProvider")
  return ctx
}
