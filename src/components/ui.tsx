/** Shared panel background: dark, semi-transparent with blur */
export const PANEL_BG = "bg-gray-950/85 backdrop-blur";

type ButtonVariant = "primary" | "danger" | "ghost";
type ButtonSize = "sm" | "xs";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-indigo-600 hover:bg-indigo-500 text-white",
  danger: "bg-red-500/20 hover:bg-red-500/30 text-red-400",
  ghost: "text-white/50 hover:text-white/70",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-4 py-1.5 text-sm",
  xs: "px-3 py-1.5 text-xs",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export function Button({
  variant = "primary",
  size = "xs",
  fullWidth,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`rounded transition-colors cursor-pointer disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
