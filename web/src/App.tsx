import { Router, Route, useNavigate } from '@solidjs/router'
import { onMount, onCleanup } from 'solid-js'
import MainApp from './pages/MainApp'
import SettingsPage from './pages/SettingsPage'
import AgentsPage from './pages/AgentsPage'
import RunsPage from './pages/RunsPage'
import ChannelsPage from './pages/ChannelsPage'
import MCPServersPage from './pages/MCPServersPage'
import { registerKeyboardShortcuts } from './lib/keyboard'

function AppShell(props: { children?: any }) {
  const navigate = useNavigate()

  onMount(() => {
    const cleanup = registerKeyboardShortcuts(navigate)
    onCleanup(cleanup)
  })

  return <>{props.children}</>
}

export default function App() {
  return (
    <Router root={AppShell}>
      <Route path="/" component={MainApp} />
      <Route path="/agents" component={AgentsPage} />
      <Route path="/runs" component={RunsPage} />
      <Route path="/channels" component={ChannelsPage} />
      <Route path="/mcpservers" component={MCPServersPage} />
      <Route path="/settings" component={SettingsPage} />
    </Router>
  )
}
