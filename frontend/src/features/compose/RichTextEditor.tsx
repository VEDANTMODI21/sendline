import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import {
  AlignCenter, AlignLeft, AlignRight, Bold, ChevronDown, Indent, Italic, List, ListOrdered, Outdent, Quote, Redo2,
  RemoveFormatting, Strikethrough, Type, Underline, Undo2,
} from 'lucide-react';
import { cn } from '@/lib/cn';

export interface RichTextHandle {
  html: () => string;
  text: () => string;
  clear: () => void;
  focus: () => void;
}

type Cmd = 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'insertOrderedList' | 'insertUnorderedList';
const TRACKED: Cmd[] = ['bold', 'italic', 'underline', 'strikeThrough', 'insertOrderedList', 'insertUnorderedList'];
const SIZES = [
  { label: 'Small', value: '2' },
  { label: 'Normal', value: '3' },
  { label: 'Large', value: '5' },
  { label: 'Huge', value: '6' },
];
const ALIGN = ['justifyLeft', 'justifyCenter', 'justifyRight'] as const;

function Tool({ label, onRun, active, children }: { label: string; onRun: () => void; active?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      // mousedown + preventDefault keeps the text selection inside the editor
      onMouseDown={(e) => {
        e.preventDefault();
        onRun();
      }}
      className={cn('inline-flex size-7 items-center justify-center rounded-md text-ink-soft hover:bg-canvas hover:text-ink', active && 'bg-brand-50 text-brand-700')}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-1 h-4 w-px bg-line" />;

/**
 * Small contentEditable editor. The browser's editing commands do the heavy lifting; the server
 * sanitises the HTML (allow-list) before it is stored or sent, so nothing here is trusted.
 */
export const RichTextEditor = forwardRef<RichTextHandle, { placeholder?: string; onChange?: (text: string) => void; invalid?: boolean }>(
  function RichTextEditor({ placeholder, onChange, invalid }, ref) {
    const el = useRef<HTMLDivElement>(null);
    const [active, setActive] = useState<Set<Cmd>>(new Set());
    const [align, setAlign] = useState(0);
    const [sizeOpen, setSizeOpen] = useState(false);

    useImperativeHandle(ref, () => ({
      html: () => el.current?.innerHTML ?? '',
      text: () => el.current?.innerText.trim() ?? '',
      clear: () => {
        if (el.current) el.current.innerHTML = '';
      },
      focus: () => el.current?.focus(),
    }));

    const sync = useCallback(() => {
      setActive(new Set(TRACKED.filter((c) => document.queryCommandState(c))));
      onChange?.(el.current?.innerText.trim() ?? '');
    }, [onChange]);

    useEffect(() => {
      document.addEventListener('selectionchange', sync);
      return () => document.removeEventListener('selectionchange', sync);
    }, [sync]);

    const run = (cmd: string, value?: string) => {
      el.current?.focus();
      document.execCommand(cmd, false, value);
      sync();
    };

    const cycleAlign = () => {
      const next = (align + 1) % ALIGN.length;
      setAlign(next);
      run(ALIGN[next]);
    };
    const AlignIcon = [AlignLeft, AlignCenter, AlignRight][align];

    return (
      <div className={cn('rounded-lg bg-canvas/70 p-3', invalid && 'ring-1 ring-red-300')}>
        <div className="flex flex-wrap items-center gap-0.5 rounded-full bg-white px-2 py-1 shadow-[0_0_0_1px_var(--color-line)]" role="toolbar" aria-label="Formatting">
          <Tool label="Undo" onRun={() => run('undo')}><Undo2 className="size-4" /></Tool>
          <Tool label="Redo" onRun={() => run('redo')}><Redo2 className="size-4" /></Tool>
          <Divider />
          <div className="relative">
            <button
              type="button"
              aria-label="Text size"
              title="Text size"
              onMouseDown={(e) => {
                e.preventDefault();
                setSizeOpen((o) => !o);
              }}
              className="inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 text-ink-soft hover:bg-canvas"
            >
              <Type className="size-4" /> <ChevronDown className="size-3" />
            </button>
            {sizeOpen && (
              <div className="absolute top-full left-0 z-30 mt-1 w-28 rounded-md border border-line bg-white p-1 shadow-pop">
                {SIZES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      run('fontSize', s.value);
                      setSizeOpen(false);
                    }}
                    className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-canvas"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Divider />
          <Tool label="Bold" active={active.has('bold')} onRun={() => run('bold')}><Bold className="size-4" /></Tool>
          <Tool label="Italic" active={active.has('italic')} onRun={() => run('italic')}><Italic className="size-4" /></Tool>
          <Tool label="Underline" active={active.has('underline')} onRun={() => run('underline')}><Underline className="size-4" /></Tool>
          <Divider />
          <Tool label="Alignment" onRun={cycleAlign}><AlignIcon className="size-4" /></Tool>
          <Tool label="Clear formatting" onRun={() => run('removeFormat')}><RemoveFormatting className="size-4" /></Tool>
          <Divider />
          <Tool label="Numbered list" active={active.has('insertOrderedList')} onRun={() => run('insertOrderedList')}><ListOrdered className="size-4" /></Tool>
          <Tool label="Bulleted list" active={active.has('insertUnorderedList')} onRun={() => run('insertUnorderedList')}><List className="size-4" /></Tool>
          <Tool label="Indent" onRun={() => run('indent')}><Indent className="size-4" /></Tool>
          <Tool label="Outdent" onRun={() => run('outdent')}><Outdent className="size-4" /></Tool>
          <Tool label="Quote" onRun={() => run('formatBlock', 'blockquote')}><Quote className="size-4" /></Tool>
          <Divider />
          <Tool label="Strikethrough" active={active.has('strikeThrough')} onRun={() => run('strikeThrough')}><Strikethrough className="size-4" /></Tool>
        </div>
        <div
          ref={el}
          role="textbox"
          aria-multiline="true"
          aria-label="Email body"
          contentEditable
          suppressContentEditableWarning
          data-placeholder={placeholder}
          onInput={sync}
          className="editor-surface prose-mail mt-3 min-h-[280px] px-1 outline-none"
        />
      </div>
    );
  },
);
