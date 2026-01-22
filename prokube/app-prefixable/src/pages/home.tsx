import { useNavigate } from "@solidjs/router"
import { Button } from "@opencode-ai/ui/button"
import { useSDK } from "../context/sdk"

export function Home() {
  const { client } = useSDK()
  const navigate = useNavigate()

  async function createNewSession() {
    try {
      const res = await client.session.create({})
      if (res.data) {
        navigate(`/session/${res.data.id}`)
      }
    } catch (e) {
      console.error("Failed to create session:", e)
    }
  }

  return (
    <div class="flex flex-col items-center justify-center h-full bg-gray-50">
      <div class="text-center max-w-md">
        <div class="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg class="w-10 h-10 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </div>
        <h1 class="text-2xl font-bold text-gray-900 mb-2">Welcome to OpenCode</h1>
        <p class="text-gray-500 mb-6">Select a session from the sidebar or start a new one.</p>
        <Button onClick={createNewSession} variant="primary">
          Start New Session
        </Button>
      </div>
    </div>
  )
}
