'use client';

export default function LogoMark({
  size = 42,
  title = 'Puriy',
}: {
  size?: number;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-label={title}
    >
      <title>{title}</title>
      <rect width="48" height="48" rx="11" fill="var(--color-ink)" />
      <path
        d="M13 34h9a5 5 0 0 0 5-5v-9a5 5 0 0 1 5-5h3"
        fill="none"
        stroke="var(--color-paper)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="13" cy="34" r="4" fill="var(--color-accent)" stroke="var(--color-ink)" strokeWidth="2" />
      <circle cx="35" cy="15" r="4" fill="var(--color-paper)" stroke="var(--color-ink)" strokeWidth="2" />
    </svg>
  );
}
