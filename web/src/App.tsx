import { Router, Route, useNavigate } from '@solidjs/router'
import { onMount, onCleanup } from 'solid-js'
import MainApp from './pages/MainApp'
import SettingsPage from './pages/SettingsPage'
import { registerKeyboardShortcuts } from './lib/keyboard'
import AppErrorBoundary from './components/shared/ErrorBoundary'

function AppShell(props: { children?: any }) {
  const navigate = useNavigate()

  onMount(() => {
    const cleanup = registerKeyboardShortcuts(navigate)
    onCleanup(cleanup)
  })

  return (
    <AppErrorBoundary name="Application">
      {props.children}
    </AppErrorBoundary>
  )
}

export default function App() {
  return (
    <Router root={AppShell}>
      <Route path="/" component={MainApp} />
      <Route path="/settings" component={SettingsPage} />
    </Router>
  )
}
