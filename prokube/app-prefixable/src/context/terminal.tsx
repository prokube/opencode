import { createContext, useContext, createSignal, type ParentProps } from "solid-js"
import { useSDK } from "./sdk"

interface PTYSession {
  id: string
  title: string
}

interface TerminalContextValue {
  sessions: () => PTYSession[]
  active: () => string | null
  opened: () => boolean
  height: () => number
  create: () => Promise<string | null>
  close: (id: string) => Promise<void>
  setActive: (id: string | null) => void
  toggle: () => void
  open: () => void
  setHeight: (h: number) => void
}

const TerminalContext = createContext<TerminalContextValue>()

export function TerminalProvider(props: ParentProps) {
  const { client } = useSDK()
  const [sessions, setSessions] = createSignal<PTYSession[]>([])
  const [active, setActive] = createSignal<string | null>(null)
  const [opened, setOpened] = createSignal(false)
  const [height, setHeight] = createSignal(280)

  async function create(): Promise<string | null> {
    try {
      const res = await client.pty.create({})
      if (res.data) {
        const session: PTYSession = {
          id: res.data.id,
          title: `Terminal ${sessions().length + 1}`,
        }
        setSessions((prev) => [...prev, session])
        setActive(session.id)
        setOpened(true)
        return session.id
      }
    } catch (e) {
      console.error("Failed to create PTY:", e)
    }
    return null
  }

  async function close(id: string): Promise<void> {
    try {
      await client.pty.remove({ ptyID: id })
      setSessions((prev) => prev.filter((s) => s.id !== id))
      if (active() === id) {
        const remaining = sessions().filter((s) => s.id !== id)
        setActive(remaining.length > 0 ? remaining[0].id : null)
        if (remaining.length === 0) {
          setOpened(false)
        }
      }
    } catch (e) {
      console.error("Failed to close PTY:", e)
    }
  }

  function toggle() {
    if (opened()) {
      setOpened(false)
    } else {
      if (sessions().length === 0) {
        create()
      } else {
        setOpened(true)
      }
    }
  }

  function open() {
    if (sessions().length === 0) {
      create()
    } else {
      setOpened(true)
    }
  }

  return (
    <TerminalContext.Provider
      value={{
        sessions,
        active,
        opened,
        height,
        create,
        close,
        setActive,
        toggle,
        open,
        setHeight,
      }}
    >
      {props.children}
    </TerminalContext.Provider>
  )
}

export function useTerminal() {
  const ctx = useContext(TerminalContext)
  if (!ctx) throw new Error("useTerminal must be used within TerminalProvider")
  return ctx
}
