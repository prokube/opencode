import { Router, Route, Navigate } from "@solidjs/router"
import { BasePathProvider, useBasePath } from "./context/base-path"
import { SDKProvider } from "./context/sdk"
import { EventProvider } from "./context/events"
import { ProviderProvider } from "./context/providers"
import { CommandProvider } from "./context/command"
import { DirectoryLayout } from "./pages/directory-layout"
import { Home } from "./pages/home"
import { Session } from "./pages/session"
import { Settings } from "./pages/settings"
import { ProjectPicker } from "./pages/project-picker"

function AppRoutes() {
  const { basePath } = useBasePath()
  const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath

  return (
    <Router base={base}>
      {/* Root: Show project picker or redirect to last project */}
      <Route path="/" component={ProjectPicker} />

      {/* Directory-scoped routes */}
      <Route path="/:dir" component={DirectoryLayout}>
        <Route path="/" component={() => <Navigate href="session" />} />
        <Route path="/session/:id?" component={Session} />
        <Route path="/settings" component={Settings} />
      </Route>
    </Router>
  )
}

export function App() {
  return (
    <BasePathProvider>
      <CommandProvider>
        <AppRoutes />
      </CommandProvider>
    </BasePathProvider>
  )
}
