import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Paperclip, X } from 'lucide-react';
import { Button, FormRow, IconButton, NumberBox, useToast } from '@/components/ui';
import { useAppConfig, useSchedule, useSenders } from '@/hooks/queries';
import { ApiError } from '@/lib/http';
import { longTime, pluralize, relative } from '@/lib/format';
import { RichTextEditor, type RichTextHandle } from './RichTextEditor';
import { RecipientField } from './RecipientField';
import { SendLaterPopover } from './SendLaterPopover';
import { SenderSelect } from './SenderSelect';

type Errors = Partial<Record<'recipients' | 'subject' | 'body' | 'delay' | 'hourly' | 'sender', string>>;

const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export function ComposePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const senders = useSenders();
  const config = useAppConfig();
  const schedule = useSchedule();
  const editor = useRef<RichTextHandle>(null);
  // One key per compose session: a double click or a retry after a timeout never schedules twice.
  const idempotencyKey = useRef(newKey());

  const [senderId, setSenderId] = useState<number | null>(null);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [delay, setDelay] = useState('');
  const [hourly, setHourly] = useState('');
  const [, setBodyText] = useState('');
  const [sendAt, setSendAt] = useState<Date | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const maxHourly = config.data?.maxHourlyPerSender;
  const maxRecipients = config.data?.maxRecipients ?? 10_000;

  useEffect(() => {
    if (senderId === null && senders.data?.length) setSenderId(senders.data[0].id);
  }, [senders.data, senderId]);

  const validate = (): Errors => {
    const e: Errors = {};
    if (!senderId) e.sender = 'Choose a sender';
    if (!recipients.length) e.recipients = 'Add at least one recipient or upload a list';
    if (!subject.trim()) e.subject = 'Subject is required';
    if (!editor.current?.text()) e.body = 'Write the email body';
    const d = delay === '' ? 0 : Number(delay);
    if (!Number.isInteger(d) || d < 0 || d > 86_400) e.delay = 'Delay must be 0–86400 seconds';
    if (hourly !== '') {
      const h = Number(hourly);
      if (!Number.isInteger(h) || h < 1) e.hourly = 'Hourly limit must be at least 1';
      else if (maxHourly && h > maxHourly) e.hourly = `Server cap is ${maxHourly}/hour per sender`;
    }
    return e;
  };

  const submit = (ev?: FormEvent) => {
    ev?.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error('Check the form', Object.values(e)[0]);
      return;
    }
    schedule.mutate(
      {
        key: idempotencyKey.current,
        body: {
          senderId: senderId!,
          subject: subject.trim(),
          bodyHtml: editor.current!.html(),
          recipients,
          startAt: (sendAt ?? new Date()).toISOString(),
          delaySeconds: delay === '' ? 0 : Number(delay),
          hourlyLimit: hourly === '' ? undefined : Number(hourly),
        },
      },
      {
        onSuccess: (r) => {
          idempotencyKey.current = newKey();
          const first = r.firstSendAt ? ` First one goes out ${relative(r.firstSendAt)}.` : '';
          const extra = [
            r.duplicatesRemoved ? `${r.duplicatesRemoved} duplicate${r.duplicatesRemoved > 1 ? 's' : ''} removed` : '',
            r.invalid.length ? `${r.invalid.length} invalid skipped` : '',
          ].filter(Boolean).join(' · ');
          toast.success(`${pluralize(r.scheduled, 'email')} scheduled`, `${first}${extra ? ` ${extra}.` : ''} Limit: ${r.hourlyLimit}/hour.`);
          navigate('/scheduled');
        },
        onError: (err) => {
          if (err instanceof ApiError && err.fields?.length) {
            const map: Record<string, keyof Errors> = { recipients: 'recipients', subject: 'subject', bodyHtml: 'body', delaySeconds: 'delay', hourlyLimit: 'hourly', senderId: 'sender' };
            setErrors(Object.fromEntries(err.fields.map((f) => [map[f.field] ?? 'subject', f.message])));
          }
          toast.error('Could not schedule', err.message);
        },
      },
    );
  };

  return (
    <form className="flex h-full flex-col" onSubmit={submit} noValidate>
      <header className="flex items-center gap-3 px-5 py-3">
        <IconButton label="Back" onClick={() => navigate(-1)} className="text-ink">
          <ArrowLeft className="size-5" />
        </IconButton>
        <h1 className="flex-1 text-lg font-medium">Compose New Email</h1>
        {sendAt && (
          <span className="hidden items-center gap-1 rounded-full bg-brand-50 py-1 pr-1 pl-2.5 text-[11px] text-brand-700 sm:inline-flex">
            {longTime(sendAt.toISOString())}
            <button type="button" aria-label="Clear scheduled time" className="rounded-full p-0.5 hover:bg-brand-100" onClick={() => setSendAt(null)}>
              <X className="size-3" />
            </button>
          </span>
        )}
        <IconButton label="Attachments are not supported for scheduled campaigns" disabled>
          <Paperclip className="size-4" />
        </IconButton>
        <div className="relative">
          <IconButton label="Send later" active={!!sendAt || pickerOpen} onClick={() => setPickerOpen((o) => !o)}>
            <Clock className="size-4" />
          </IconButton>
          {pickerOpen && <SendLaterPopover open value={sendAt} onPick={setSendAt} onClose={() => setPickerOpen(false)} />}
        </div>
        <Button type="submit" variant="outline" pill loading={schedule.isPending}>
          {sendAt ? 'Send Later' : 'Send'}
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10">
        <div className="mx-auto max-w-3xl">
          <FormRow label="From" htmlFor="compose-from" bordered={false}>
            <SenderSelect senders={senders.data ?? []} value={senderId} onChange={setSenderId} loading={senders.isPending} />
            {errors.sender && <p className="text-[11px] text-red-600">{errors.sender}</p>}
          </FormRow>

          <FormRow label="To" htmlFor="compose-to">
            <RecipientField value={recipients} onChange={(v) => { setRecipients(v); setErrors((e) => ({ ...e, recipients: undefined })); }} max={maxRecipients} invalid={!!errors.recipients} />
          </FormRow>
          {errors.recipients && <p className="ml-[4.5rem] pt-1 text-[11px] text-red-600">{errors.recipients}</p>}

          <FormRow label="Subject" htmlFor="compose-subject">
            <input
              id="compose-subject"
              value={subject}
              maxLength={200}
              onChange={(e) => { setSubject(e.target.value); setErrors((x) => ({ ...x, subject: undefined })); }}
              placeholder="Subject"
              aria-invalid={!!errors.subject}
              className="h-10 w-full bg-transparent text-[13px] outline-none placeholder:text-muted"
            />
          </FormRow>
          {errors.subject && <p className="ml-[4.5rem] pt-1 text-[11px] text-red-600">{errors.subject}</p>}

          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 py-4">
            <label className="flex items-center gap-3 text-xs text-ink-soft">
              Delay between 2 emails
              <NumberBox value={delay} onChange={(e) => setDelay(e.target.value)} placeholder="00" suffix="sec" max={86_400} invalid={!!errors.delay} aria-label="Delay between emails in seconds" />
            </label>
            <label className="flex items-center gap-3 text-xs text-ink-soft">
              Hourly Limit
              <NumberBox value={hourly} onChange={(e) => setHourly(e.target.value)} placeholder="00" min={1} max={maxHourly} invalid={!!errors.hourly} aria-label="Maximum emails per hour" />
            </label>
            <span className="text-[11px] text-muted">
              {errors.delay || errors.hourly || (maxHourly ? `Blank limit = server cap (${maxHourly}/hr per sender)` : '')}
            </span>
          </div>

          <RichTextEditor ref={editor} placeholder="Type Your Reply..." invalid={!!errors.body} onChange={(t) => { setBodyText(t); if (t) setErrors((x) => ({ ...x, body: undefined })); }} />
          {errors.body && <p className="pt-1 text-[11px] text-red-600">{errors.body}</p>}

          {recipients.length > 0 && (
            <p className="mt-4 text-xs text-muted">
              {pluralize(recipients.length, 'email')} will start {sendAt ? relative(sendAt.toISOString()) : 'right away'}
              {delay && Number(delay) > 0 ? `, one every ${delay}s` : ''}, at most {hourly || maxHourly || '—'} per hour. Anything over the limit waits for the next hour instead of being dropped.
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
