import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Upload, X } from 'lucide-react';
import { extractAddresses, isAddress } from '@/lib/recipients';
import { pluralize } from '@/lib/format';
import { cn } from '@/lib/cn';

const VISIBLE_CHIPS = 3;

export interface UploadSummary {
  file: string;
  found: number;
  duplicates: number;
  invalid: number;
}

/** "To" row: chips for typed/pasted addresses plus an "Upload List" for CSV/TXT lead files. */
export function RecipientField({ value, onChange, max, invalid }: {
  value: string[];
  onChange: (next: string[]) => void;
  max: number;
  invalid?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const add = (text: string) => {
    const { valid } = extractAddresses(text);
    if (!valid.length) return false;
    const merged = [...new Set([...value, ...valid])].slice(0, max);
    onChange(merged);
    return true;
  };

  const commitDraft = () => {
    if (draft.trim() && add(draft)) setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (['Enter', ',', ';', 'Tab', ' '].includes(e.key) && draft.trim()) {
      if (e.key !== 'Tab') e.preventDefault();
      commitDraft();
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (/[\s,;]/.test(text.trim())) {
      e.preventDefault();
      add(text);
    }
  };

  const onFile = async (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setFileError('File is larger than 5 MB.');
    const parsed = extractAddresses(await file.text());
    if (!parsed.valid.length) return setFileError(`No email addresses found in ${file.name}.`);
    const before = new Set(value);
    const merged = [...new Set([...value, ...parsed.valid])];
    const overlap = parsed.valid.filter((a) => before.has(a)).length;
    onChange(merged.slice(0, max));
    setSummary({ file: file.name, found: parsed.valid.length, duplicates: parsed.duplicates + overlap, invalid: parsed.invalid.length });
    if (merged.length > max) setFileError(`Only the first ${max.toLocaleString()} addresses were kept.`);
  };

  const shown = expanded ? value : value.slice(0, VISIBLE_CHIPS);
  const hidden = value.length - shown.length;

  return (
    <div>
      <div className="flex min-h-10 items-center gap-3">
        <div className={cn('flex min-w-0 flex-1 flex-wrap items-center gap-1.5 py-1.5', invalid && !value.length && 'rounded ring-1 ring-red-300')}>
          {shown.map((addr) => (
            <span key={addr} className="inline-flex h-6 items-center gap-1 rounded-full border border-brand-500 bg-surface pr-1 pl-2.5 text-[11px] text-ink">
              {addr}
              <button type="button" aria-label={`Remove ${addr}`} className="rounded-full p-0.5 text-muted hover:text-ink" onClick={() => onChange(value.filter((v) => v !== addr))}>
                <X className="size-3" />
              </button>
            </span>
          ))}
          {hidden > 0 && (
            <button type="button" onClick={() => setExpanded(true)} className="inline-flex h-6 items-center rounded-full border border-brand-500 px-2 text-[11px] font-medium text-brand-700 hover:bg-brand-50">
              +{hidden.toLocaleString()}
            </button>
          )}
          {expanded && value.length > VISIBLE_CHIPS && (
            <button type="button" onClick={() => setExpanded(false)} className="text-[11px] text-muted hover:text-ink">
              show less
            </button>
          )}
          <input
            id="compose-to"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onBlur={commitDraft}
            placeholder={value.length ? '' : 'recipient@example.com'}
            aria-invalid={draft.length > 0 && !isAddress(draft)}
            className="min-w-[160px] flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted"
          />
        </div>
        <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700">
          <Upload className="size-3.5" /> Upload List
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {(summary || fileError || value.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-2 text-[11px]">
          {value.length > 0 && <span className="font-medium text-brand-700">{pluralize(value.length, 'recipient')} ready</span>}
          {summary && (
            <span className="text-muted">
              {summary.file}: {pluralize(summary.found, 'address', 'addresses')} detected
              {summary.duplicates > 0 && ` · ${summary.duplicates} duplicate${summary.duplicates === 1 ? '' : 's'} skipped`}
              {summary.invalid > 0 && ` · ${summary.invalid} invalid`}
            </span>
          )}
          {fileError && <span className="text-red-600">{fileError}</span>}
          {value.length > 0 && (
            <button type="button" className="text-muted underline-offset-2 hover:text-ink hover:underline" onClick={() => { onChange([]); setSummary(null); }}>
              clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
