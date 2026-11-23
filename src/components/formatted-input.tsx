"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { inputDisplayValue, inputSubmitValue, maskInput, type InputFormat } from "@/lib/input-masks";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange" | "onInput"> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
};

const settings = {
  date: { placeholder: "dd/mm/aaaa", maxLength: 10, message: "Informe uma data válida no formato DD/MM/AAAA." },
  month: { placeholder: "mm/aaaa", maxLength: 7, message: "Informe o mês e o ano no formato MM/AAAA." },
  money: { placeholder: "0,00", maxLength: 16, message: "Informe um valor com até 10 dígitos inteiros e 2 casas decimais." },
};

function FormattedInput({ format, value, defaultValue = "", onValueChange, name, disabled, form, onKeyDown, ...props }: Props & { format: InputFormat }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(() => ({ source: value, text: inputDisplayValue(value ?? defaultValue, format) }));
  const display = value !== undefined && value !== draft.source ? inputDisplayValue(value, format) : draft.text;
  const submitted = inputSubmitValue(display, format);

  useEffect(() => {
    inputRef.current?.setCustomValidity(display && !submitted ? settings[format].message : "");
  }, [display, submitted, format]);

  useEffect(() => {
    const owner = inputRef.current?.form;
    if (!owner || value !== undefined) return;
    const reset = () => setDraft({ source: undefined, text: inputDisplayValue(defaultValue, format) });
    owner.addEventListener("reset", reset);
    return () => owner.removeEventListener("reset", reset);
  }, [defaultValue, format, value, form]);

  return <>
    <input placeholder={settings[format].placeholder} maxLength={settings[format].maxLength} {...props} ref={inputRef} form={form} type="text" data-input-format={format} inputMode={format === "money" ? "decimal" : "numeric"} disabled={disabled} value={display}
      onChange={(event) => {
        const input = event.currentTarget;
        const cursor = input.selectionStart ?? input.value.length;
        const digitsBefore = input.value.slice(0, cursor).replace(/\D/g, "").length;
        const digitsAfter = input.value.slice(cursor).replace(/\D/g, "").length;
        const deleting = (event.nativeEvent as InputEvent).inputType?.startsWith("delete");
        const text = format === "money" && deleting && /^0+$/.test(input.value.replace(/\D/g, "")) ? "" : maskInput(input.value, format);
        const canonical = inputSubmitValue(text, format);
        setDraft({ source: value === undefined ? undefined : canonical, text });
        onValueChange?.(canonical);
        input.setCustomValidity(text && !canonical ? settings[format].message : "");
        input.value = text;
        let caret = text.length;
        if (format === "money") {
          let remaining = digitsAfter;
          while (caret > 0 && remaining > 0) {
            caret -= 1;
            if (/\d/.test(text[caret])) remaining -= 1;
          }
        } else {
          caret = 0;
          let remaining = digitsBefore;
          while (caret < text.length && remaining > 0) {
            if (/\d/.test(text[caret])) remaining -= 1;
            caret += 1;
          }
        }
        input.setSelectionRange(caret, caret);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        const input = event.currentTarget;
        const cursor = input.selectionStart ?? 0;
        if (input.selectionEnd !== cursor) return;
        // Delete the adjacent digit as well when backspacing over an inserted separator.
        if (event.key === "Backspace" && cursor > 1 && /\D/.test(input.value[cursor - 1])) input.setSelectionRange(cursor - 2, cursor);
        if (event.key === "Delete" && cursor < input.value.length - 1 && /\D/.test(input.value[cursor])) input.setSelectionRange(cursor, cursor + 2);
      }} />
    {name && <input type="hidden" name={name} value={submitted} disabled={disabled} form={form} />}
  </>;
}

export function DateInput(props: Props) { return <FormattedInput {...props} format="date" />; }
export function MonthInput(props: Props) { return <FormattedInput {...props} format="month" />; }
export function MoneyInput(props: Props) { return <FormattedInput {...props} format="money" />; }
