'use client';

import { motion } from 'framer-motion';
import { EASE_LUXE } from '@/lib/motion';

/** Re-mounts on every navigation → smooth page entrance. */
export default function StoreTemplate({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE_LUXE }}>
      {children}
    </motion.div>
  );
}
