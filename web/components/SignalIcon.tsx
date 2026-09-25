export default function SignalIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="7" y="2" width="10" height="18" rx="3" />
      <path d="M12 20v2M4 5h3M17 5h3M4 11h3M17 11h3" />
      <circle cx="12" cy="6" r="1" />
      <circle cx="12" cy="11" r="1" />
      <circle cx="12" cy="16" r="1" />
    </svg>
  );
}
