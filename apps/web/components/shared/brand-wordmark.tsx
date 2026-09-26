import { cn } from '@hms/ui';

type BrandWordmarkProps = {
  className?: string;
};

/** "MetaKlinik" set as the logo: a light gradient "Meta" and a heavy navy "Klinik". */
export function BrandWordmark({ className }: BrandWordmarkProps) {
  return (
    <span className={cn('font-heading leading-none tracking-tight whitespace-nowrap', className)}>
      <span className="bg-linear-to-r from-[#1F5BF0] via-[#0A8FD6] to-[#0FB39B] bg-clip-text font-medium text-transparent">
        Meta
      </span>
      <span className="font-extrabold text-slate-900">Klinik</span>
    </span>
  );
}
