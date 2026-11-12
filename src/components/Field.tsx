import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { useId } from 'react'
import { ChevronDown } from 'lucide-react'

const boxClass =
  'h-10 w-full border-[0.5px] border-line bg-paper px-3 text-small font-light text-ink outline-none placeholder:text-ink/50 focus:border-primary focus:ring-[0.5px] focus:ring-primary'

/** Medium 12px label above its control, 4px apart. */
export function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-small font-medium">
        {label}
      </label>
      {children(id)}
    </div>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={boxClass} />
}

export type SelectOption = { value: string; label: string; disabled?: boolean }

/** Native select (keeps the phone's own picker) styled as the Figma dropdown with a 20px chevron. */
export function Select({
  options,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { options: SelectOption[] }) {
  return (
    <div className="relative">
      <select {...props} className={`${boxClass} appearance-none pr-10`}>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-2.5 right-3 size-5" strokeWidth={1.5} />
    </div>
  )
}
