import proxysIcon from '@/assets/proxys-icon.png';

/**
 * Логотип Proxys.io — воспроизводит фирменный локап:
 * жирное «PR», маска вместо «O», жирное «XY», тонкое «S.IO».
 * Текст наследует currentColor, поэтому работает и на светлом, и на тёмном фоне.
 */
const SIZES = {
  sm: { text: 'text-sm', icon: 'h-3.5 w-3.5', gap: 'gap-[1px]' },
  md: { text: 'text-base', icon: 'h-4 w-4', gap: 'gap-[2px]' },
  lg: { text: 'text-xl', icon: 'h-5 w-5', gap: 'gap-[2px]' },
  xl: { text: 'text-3xl', icon: 'h-8 w-8', gap: 'gap-[3px]' },
} as const;

export function ProxysLogo({
  size = 'md',
  className = '',
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <span
      className={`inline-flex items-center ${s.gap} ${s.text} leading-none select-none whitespace-nowrap ${className}`}
    >
      <span className="font-extrabold tracking-tight">PR</span>
      <img src={proxysIcon} alt="" className={`${s.icon} object-contain -mx-[1px]`} />
      <span className="font-extrabold tracking-tight">XY</span>
      <span className="font-light tracking-tight opacity-90">S.IO</span>
    </span>
  );
}

/** Только фирменный знак — для компактных мест (кнопки, чипы) */
export function ProxysMark({ className = 'h-5 w-5' }: { className?: string }) {
  return <img src={proxysIcon} alt="Proxys.io" className={`${className} object-contain`} />;
}

export default ProxysLogo;
