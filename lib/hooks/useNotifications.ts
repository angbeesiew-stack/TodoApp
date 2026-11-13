'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatSingaporeDate } from '@/lib/timezone';
import type { Todo } from '@/lib/db';

interface NotificationResponse {
  success: boolean;
  data: Todo[];
}

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    typeof Notification === 'undefined' ? 'denied' : Notification.permission,
  );
  const [error, setError] = useState<string | null>(null);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') {
      setError('Browser notifications are not supported in this browser.');
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    setError(null);
  }, []);

  useEffect(() => {
    if (permission !== 'granted') return;

    const poll = async () => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
        setPermission('denied');
        return;
      }

      const response = await fetch('/api/notifications/check');
      if (!response.ok) throw new Error('Could not check due reminders.');
      const result = (await response.json()) as NotificationResponse;
      for (const todo of result.data) {
        new Notification(todo.title, {
          body: todo.due_date
            ? `Due ${formatSingaporeDate(todo.due_date, 'yyyy-MM-dd HH:mm')}`
            : 'Todo reminder',
          tag: `todo-${todo.id}`,
        });
        const marked = await fetch(`/api/todos/${todo.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ last_notification_sent: new Date().toISOString() }),
        });
        if (!marked.ok) throw new Error(`Could not record reminder for "${todo.title}".`);
      }
    };

    const handleError = (reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Reminder polling failed.');
    };
    void poll().catch(handleError);
    const timer = window.setInterval(() => {
      void poll().catch(handleError);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [permission]);

  return { permission, requestPermission, error };
}
