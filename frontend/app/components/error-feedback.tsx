/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-29
Scope: Added reusable accessible toast and inline field feedback for service forms.
Author review: Pending frontend owner review and visual verification.
*/
"use client";

import { useEffect, useState } from 'react';

// AI-generated (pending human review)
export function ErrorToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDismiss, 6000);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);
  if (!message) return null;
  return <div className="error-toast" role="alert"><span>{message}</span><button type="button" onClick={onDismiss} aria-label="Dismiss error">×</button></div>;
}

export function FieldError({ messages, id }: { messages?: string[]; id: string }) {
  if (!messages?.length) return null;
  return <span id={id} className="field-error">{messages.join(' ')}</span>;
}

export function useErrorFeedback() {
  const [toast, setToast] = useState('');
  const [fields, setFields] = useState<Record<string, string[]>>({});
  return {
    toast, setToast, fields, setFields,
    clearField: (name: string) => setFields((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    }),
    clear: () => { setToast(''); setFields({}); },
  };
}
