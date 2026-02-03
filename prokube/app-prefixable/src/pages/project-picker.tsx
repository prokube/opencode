import { createSignal } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { base64Encode } from "../utils/path"
import { Folder, GitBranch, Plus } from "lucide-solid"
import { ProjectDialog } from "../components/project-dialog"

// OpenCode Wordmark
function OpenCodeWordmark(props: { class?: string }) {
  return (
    <svg class={props.class} viewBox="0 0 640 115" fill="none" xmlns="http://www.w3.org/2000/svg">
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
      <path d="M393.844 32.8573H344.613V82.143H393.844V98.5716H328.203V16.4287H393.844V32.8573Z" fill="#211E1E" />
      <path d="M459.485 82.1433H426.664V49.2861H459.485V82.1433Z" fill="#CFCECD" />
      <path
        d="M459.489 32.8573H426.668V82.143H459.489V32.8573ZM475.899 98.5716H410.258V16.4287H475.899V98.5716Z"
        fill="#211E1E"
      />
      <path d="M541.539 82.1433H508.719V49.2861H541.539V82.1433Z" fill="#CFCECD" />
      <path
        d="M541.535 32.8571H508.715V82.1428H541.535V32.8571ZM557.946 98.5714H492.305V16.4286H541.535V0H557.946V98.5714Z"
        fill="#211E1E"
      />
      <path d="M639.996 65.7139V82.1424H590.766V65.7139H639.996Z" fill="#CFCECD" />
      <path
        d="M590.77 32.8573V49.2859H623.59V32.8573H590.77ZM640 65.7144H590.77V82.143H640V98.5716H574.359V16.4287H640V65.7144Z"
        fill="#211E1E"
      />
    </svg>
  )
}

// Prokube Logo
function ProkubeLogo(props: { class?: string }) {
  return (
    <svg class={props.class} viewBox="0 0 73.87881 73.87876" xmlns="http://www.w3.org/2000/svg">
      <path d="m73.87881,0H0v73.87876h73.87881V0h0Z" fill="#08000e" />
      <rect x="61.72833" y="27.10204" width="5.55266" height="5.55266" fill="#fff" />
      <path
        d="m6.59779,67.28097v-34.21636h19.11633c1.07361,0,2.05576.26894,2.94586.80538.89015.53706,1.59612,1.24374,2.11935,2.11935.52256.87621.78415,1.85102.78415,2.92463v12.88551c0,1.07422-.26159,2.04913-.78415,2.92473-.52323.87621-1.2292,1.5828-2.11935,2.11924-.8901.53706-1.87225.80528-2.94586.80528h-13.56367v9.63224h-5.55266Zm6.06129-15.18479h12.8431c.1411,0,.26098-.04899.36028-.1483.0987-.0987.14835-.21862.14835-.36028v-12.46164c0-.14115-.04965-.26098-.14835-.36028-.09931-.0987-.21918-.1484-.36028-.1484h-12.8431c-.14177,0-.26164.0497-.36028.1484-.09936.09931-.14835.21913-.14835.36028v12.46164c0,.14166.04899.26159.14835.36028.09864.09931.21852.1483.36028.1483Z"
        fill="#fff"
      />
      <path
        d="m34.55118,57.64873V23.43238h5.55266v19.12689h4.36581l8.77398-9.49465h5.93412v1.52595l-9.7913,10.76616,9.74894,10.76616v1.52585h-5.89176l-8.77398-9.49445h-4.36581v9.49445h-5.55266Z"
        fill="#fff"
      />
    </svg>
  )
}

// Action Card Component
function ActionCard(props: { icon: typeof Folder; title: string; description: string; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      class="group flex flex-col items-center p-6 rounded-xl transition-all duration-200"
      style={{
        background: "var(--background-base)",
        border: "1px solid var(--border-base)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--border-strong)"
        e.currentTarget.style.transform = "translateY(-2px)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border-base)"
        e.currentTarget.style.transform = "translateY(0)"
      }}
    >
      <div
        class="w-12 h-12 rounded-lg flex items-center justify-center mb-4 transition-colors"
        style={{ background: "var(--surface-inset)" }}
      >
        <props.icon class="w-6 h-6" style={{ color: "var(--icon-base)" }} />
      </div>
      <h3 class="text-base font-medium mb-1" style={{ color: "var(--text-strong)" }}>
        {props.title}
      </h3>
      <p class="text-sm text-center" style={{ color: "var(--text-weak)" }}>
        {props.description}
      </p>
    </button>
  )
}

/**
 * Project picker - Welcome screen with action cards.
 */
export function ProjectPicker() {
  const navigate = useNavigate()
  const [dialogOpen, setDialogOpen] = createSignal(false)
  const [dialogView, setDialogView] = createSignal<"browse" | "clone">("browse")

  function openDialog(view: "browse" | "clone") {
    setDialogView(view)
    setDialogOpen(true)
  }

  function handleProjectSelect(worktree: string) {
    navigate(`/${base64Encode(worktree)}/session`)
  }

  return (
    <div class="flex-1 flex items-center justify-center p-6">
      <div class="w-full max-w-2xl">
        {/* Logo and Title */}
        <div class="text-center mb-12">
          <div class="flex justify-center mb-6">
            <OpenCodeWordmark class="h-16" />
          </div>
          <div class="flex items-center justify-center gap-2 mb-4" style={{ color: "var(--text-weak)" }}>
            <span>Powered by</span>
            <a
              href="https://prokube.ai"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 transition-opacity hover:opacity-80"
            >
              <ProkubeLogo class="w-5 h-5 rounded" />
              <span class="font-medium" style={{ color: "var(--text-strong)" }}>
                prokube
              </span>
            </a>
          </div>
          <p class="text-lg" style={{ color: "var(--text-base)" }}>
            Get started by choosing an option below
          </p>
        </div>

        {/* Action Cards */}
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <ActionCard
            icon={Folder}
            title="Open Project"
            description="Browse and open an existing folder"
            onClick={() => openDialog("browse")}
          />
          <ActionCard
            icon={Plus}
            title="New Project"
            description="Create a new empty folder"
            onClick={() => openDialog("browse")}
          />
          <ActionCard
            icon={GitBranch}
            title="Clone Repository"
            description="Clone a Git repository"
            onClick={() => openDialog("clone")}
          />
        </div>
      </div>

      {/* Project Dialog */}
      <ProjectDialog
        open={dialogOpen()}
        onClose={() => setDialogOpen(false)}
        onSelect={handleProjectSelect}
        initialView={dialogView()}
      />

    </div>
  )
}
