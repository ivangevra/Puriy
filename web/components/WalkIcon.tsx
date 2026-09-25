export default function WalkIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="13" cy="4" r="1.7" />
      <path d="m7 11 3-3h3l2 4 3 1M12 8l-2 7 4 3 1 4M10 15l-4 6" />
    </svg>
  );
}
