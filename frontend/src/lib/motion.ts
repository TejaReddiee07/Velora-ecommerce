export const EASE_LUXE = [0.22, 1, 0.36, 1] as const;
export const EASE_IN = [0.64, 0, 0.78, 0] as const;

export const DUR = {
  micro: 0.18,
  ui: 0.32,
  reveal: 0.9,
  page: 0.55,
};

export const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE_LUXE, delay: i * 0.06 } }),
};
