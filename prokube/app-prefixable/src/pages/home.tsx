import { useNavigate } from "@solidjs/router"
import { Button } from "@opencode-ai/ui/button"
import { useSDK } from "../context/sdk"
import { base64Encode } from "../utils/path"

// OpenCode wordmark SVG (light version for dark backgrounds)
function OpenCodeLogo(props: { class?: string; style?: Record<string, string> }) {
  return (
    <svg class={props.class} style={props.style} viewBox="0 0 640 115" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g clip-path="url(#clip0)">
        <mask id="mask0" style="mask-type:luminance" maskUnits="userSpaceOnUse" x="0" y="0" width="640" height="115">
          <path d="M640 0H0V115H640V0Z" fill="white" />
        </mask>
        <g mask="url(#mask0)">
          <path d="M49.2346 82.1433H16.4141V49.2861H49.2346V82.1433Z" fill="#CFCECD" />
          <path
            d="M49.2308 32.8573H16.4103V82.143H49.2308V32.8573ZM65.641 98.5716H0V16.4287H65.641V98.5716Z"
            fill="#656363"
          />
          <path d="M131.281 82.1433H98.4609V49.2861H131.281V82.1433Z" fill="#CFCECD" />
          <path
            d="M98.4649 82.143H131.285V32.8573H98.4649V82.143ZM147.696 98.5716H98.4649V115H82.0547V16.4287H147.696V98.5716Z"
            fill="#656363"
          />
          <path d="M229.746 65.7139V82.1424H180.516V65.7139H229.746Z" fill="#CFCECD" />
          <path
            d="M229.743 65.7144H180.512V82.143H229.743V98.5716H164.102V16.4287H229.743V65.7144ZM180.512 49.2859H213.332V32.8573H180.512V49.2859Z"
            fill="#656363"
          />
          <path d="M295.383 98.5718H262.562V49.2861H295.383V98.5718Z" fill="#CFCECD" />
          <path
            d="M295.387 32.8573H262.567V98.5716H246.156V16.4287H295.387V32.8573ZM311.797 98.5716H295.387V32.8573H311.797V98.5716Z"
            fill="#656363"
          />
          <path d="M393.848 82.1433H344.617V49.2861H393.848V82.1433Z" fill="#CFCECD" />
          <path
            d="M393.844 32.8573H344.613V82.143H393.844V98.5716H328.203V16.4287H393.844V32.8573Z"
            fill="currentColor"
          />
          <path d="M459.485 82.1433H426.664V49.2861H459.485V82.1433Z" fill="#CFCECD" />
          <path
            d="M459.489 32.8573H426.668V82.143H459.489V32.8573ZM475.899 98.5716H410.258V16.4287H475.899V98.5716Z"
            fill="currentColor"
          />
          <path d="M541.539 82.1433H508.719V49.2861H541.539V82.1433Z" fill="#CFCECD" />
          <path
            d="M541.535 32.8571H508.715V82.1428H541.535V32.8571ZM557.946 98.5714H492.305V16.4286H541.535V0H557.946V98.5714Z"
            fill="currentColor"
          />
          <path d="M639.996 65.7139V82.1424H590.766V65.7139H639.996Z" fill="#CFCECD" />
          <path
            d="M590.77 32.8573V49.2859H623.59V32.8573H590.77ZM640 65.7144H590.77V82.143H640V98.5716H574.359V16.4287H640V65.7144Z"
            fill="currentColor"
          />
        </g>
      </g>
      <defs>
        <clipPath id="clip0">
          <rect width="640" height="115" fill="white" />
        </clipPath>
      </defs>
    </svg>
  )
}

export function Home() {
  const { client, directory } = useSDK()
  const navigate = useNavigate()

  async function createNewSession() {
    if (!directory) return
    try {
      const res = await client.session.create({})
      if (res.data) {
        const slug = base64Encode(directory)
        navigate(`/${slug}/session/${res.data.id}`)
      }
    } catch (e) {
      console.error("Failed to create session:", e)
    }
  }

  function openSettings() {
    if (!directory) return
    const slug = base64Encode(directory)
    navigate(`/${slug}/settings`)
  }

  return (
    <div class="flex flex-col items-center justify-center h-full" style={{ background: "var(--background-stronger)" }}>
      <div class="text-center max-w-lg px-6">
        {/* OpenCode Logo */}
        <div class="mb-8">
          <OpenCodeLogo class="w-80 mx-auto opacity-60" style={{ color: "var(--text-strong)" }} />
        </div>

        {/* Welcome text */}
        <p class="text-lg mb-8" style={{ color: "var(--text-weak)" }}>
          AI-powered coding assistant for your terminal and web
        </p>

        {/* Action buttons */}
        <div class="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={createNewSession} variant="primary" class="px-6" size="large">
            <div class="flex items-center justify-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>Start New Session</span>
            </div>
          </Button>
          <Button onClick={openSettings} variant="secondary" class="px-6" size="large">
            <div class="flex items-center justify-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <span>Settings</span>
            </div>
          </Button>
        </div>

        {/* Hint text */}
        <p class="mt-10 text-sm" style={{ color: "var(--text-weak)", opacity: 0.7 }}>
          Select a session from the sidebar or start a new conversation
        </p>
      </div>
    </div>
  )
}
