interface HomewardIconProps {
  className?: string;
}

// Geometric lotus mark — 7 petals fanned from a shared base point, sized and centered
// so the flower's bounding box sits with even padding on all sides of the viewBox
// (rather than the bare tips defining the box), so it reads centered in any round or
// square container it's dropped into (nav chip, hero circle, favicon).
export function HomewardIcon({ className = "h-4 w-4" }: HomewardIconProps) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="currentColor">
      <path transform="translate(50,83.12) rotate(-68)" d="M0,0 C-22.3,-13.03 -22.3,-26.93 0,-43.43 C22.3,-26.93 22.3,-13.03 0,0 Z" />
      <path transform="translate(50,83.12) rotate(68)" d="M0,0 C-22.3,-13.03 -22.3,-26.93 0,-43.43 C22.3,-26.93 22.3,-13.03 0,0 Z" />
      <path transform="translate(50,83.12) rotate(-48)" d="M0,0 C-24.65,-16.9 -24.65,-34.93 0,-56.34 C24.65,-34.93 24.65,-16.9 0,0 Z" />
      <path transform="translate(50,83.12) rotate(48)" d="M0,0 C-24.65,-16.9 -24.65,-34.93 0,-56.34 C24.65,-34.93 24.65,-16.9 0,0 Z" />
      <path transform="translate(50,83.12) rotate(-24)" d="M0,0 C-22.3,-20.42 -22.3,-42.21 0,-68.08 C22.3,-42.21 22.3,-20.42 0,0 Z" />
      <path transform="translate(50,83.12) rotate(24)" d="M0,0 C-22.3,-20.42 -22.3,-42.21 0,-68.08 C22.3,-42.21 22.3,-20.42 0,0 Z" />
      <path transform="translate(50,83.12) rotate(0)" d="M0,0 C-17.61,-22.54 -17.61,-46.57 0,-75.12 C17.61,-46.57 17.61,-22.54 0,0 Z" />
    </svg>
  );
}
