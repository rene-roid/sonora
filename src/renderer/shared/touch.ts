/**
 * Coarse pointer (finger) at startup. Hover-revealed actions and double-click have no touch
 * equivalent, so rows play on a single tap and reveal buttons stay visible on such devices.
 */
export const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
