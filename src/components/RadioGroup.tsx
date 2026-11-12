import { useId } from 'react'
import { Circle, CircleCheck } from 'lucide-react'

export type RadioOption<T extends string> = { value: T; label: string }

/** Question label with single-choice rows, 8px apart; the radio sits on the right. */
export function RadioGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: RadioOption<T>[]
  value: T | undefined
  onChange: (value: T) => void
}) {
  const name = useId()
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-small font-medium">{label}</legend>
      {options.map((o) => {
        const checked = o.value === value
        return (
          <label
            key={o.value}
            className="flex h-10 cursor-pointer items-center justify-between border-[0.5px] border-line bg-paper px-3 has-focus-visible:border-primary has-focus-visible:ring-[0.5px] has-focus-visible:ring-primary"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={checked}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            <span className="text-small font-light">{o.label}</span>
            <Radio checked={checked} />
          </label>
        )
      })}
    </fieldset>
  )
}

function Radio({ checked }: { checked: boolean }) {
  return checked ? (
    <CircleCheck aria-hidden className="size-4 fill-accent text-paper" strokeWidth={1.5} />
  ) : (
    <Circle aria-hidden className="size-4 text-line" strokeWidth={1} />
  )
}
