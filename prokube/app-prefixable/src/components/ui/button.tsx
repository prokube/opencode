import { type JSX, splitProps } from "solid-js"

interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger"
  size?: "sm" | "md" | "lg"
}

/**
 * Button component styled like pkui dev-labs UI
 * - White background with gray border
 * - Purple accent on hover
 * - Rounded corners
 */
export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, ["variant", "size", "class", "children"])

  const baseClasses =
    "inline-flex items-center justify-center gap-2 font-medium rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"

  const variantClasses = {
    primary:
      "bg-purple-600 border-purple-600 text-white hover:bg-purple-700 hover:border-purple-700 hover:shadow-md",
    secondary:
      "bg-white border-gray-200 text-gray-900 hover:border-purple-500 hover:bg-purple-50 hover:text-purple-700 hover:shadow-md",
    ghost:
      "bg-transparent border-transparent text-gray-700 hover:bg-purple-50 hover:text-purple-700",
    danger:
      "bg-white border-gray-200 text-red-600 hover:border-red-500 hover:bg-red-50 hover:text-red-700 hover:shadow-md",
  }

  const sizeClasses = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  }

  const variant = local.variant || "secondary"
  const size = local.size || "md"

  return (
    <button
      {...rest}
      class={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${local.class || ""}`}
    >
      {local.children}
    </button>
  )
}
