import { Router, Route } from "@solidjs/router"
import { BasePathProvider, useBasePath } from "./context/base-path"
import { SDKProvider } from "./context/sdk"
import { EventProvider } from "./context/events"
import { ProviderProvider } from "./context/providers"
import { CommandProvider } from "./context/command"
import { Home } from "./pages/home"
import { Session } from "./pages/session"
import { Settings } from "./pages/settings"
import { Layout } from "./pages/layout"

function AppRoutes() {
  const { basePath } = useBasePath()
  const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath

  return (
    <Router base={base} root={Layout}>
      <Route path="/" component={Home} />
      <Route path="/session/:id?" component={Session} />
      <Route path="/settings" component={Settings} />
    </Router>
  )
}

export function App() {
  return (
    <BasePathProvider>
      <SDKProvider>
        <EventProvider>
          <ProviderProvider>
            <CommandProvider>
              <AppRoutes />
            </CommandProvider>
          </ProviderProvider>
        </EventProvider>
      </SDKProvider>
    </BasePathProvider>
  )
}
