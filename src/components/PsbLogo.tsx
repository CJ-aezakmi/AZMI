import psbLogo from '@/assets/psb-logo.png';
import psbIcon from '@/assets/psb-icon.png';

/** Фирменные цвета PSB: бирюза глобуса и тёмный графит вордмарка */
export const PSB_TEAL = '#5AA4AD';
export const PSB_TEAL_LIGHT = '#70BCBA';
export const PSB_DARK = '#2A323D';

const SIZES = {
  sm: 'h-4',
  md: 'h-5',
  lg: 'h-7',
  xl: 'h-10',
} as const;

/** Полный логотип: глобус + вордмарк PSB */
export function PsbLogo({
  size = 'md',
  className = '',
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <img
      src={psbLogo}
      alt="PSB Proxy"
      className={`${SIZES[size]} w-auto object-contain ${className}`}
    />
  );
}

/** Только глобус — для компактных мест */
export function PsbMark({ className = 'h-5 w-5' }: { className?: string }) {
  return <img src={psbIcon} alt="PSB Proxy" className={`${className} object-contain`} />;
}

export default PsbLogo;
