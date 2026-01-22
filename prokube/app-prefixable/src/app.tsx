import { Router, Route } from "@solidjs/router"
import { BasePathProvider, useBasePath } from "./context/base-path"
import { SDKProvider } from "./context/sdk"
import { EventProvider } from "./context/events"
import { Home } from "./pages/home"
import { Session } from "./pages/session"
import { Layout } from "./pages/layout"

function AppRoutes() {
  const { basePath } = useBasePath()
  const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath

  return (
    <Router base={base} root={Layout}>
      <Route path="/" component={Home} />
      <Route path="/session/:id?" component={Session} />
    </Router>
  )
}

export function App() {
  return (
    <BasePathProvider>
      <SDKProvider>
        <EventProvider>
          <AppRoutes />
        </EventProvider>
      </SDKProvider>
    </BasePathProvider>
  )
}
