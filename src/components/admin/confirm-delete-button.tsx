'use client';

import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

interface ConfirmDeleteButtonProps {
  /** Server action to run on submit */
  action: (formData: FormData) => Promise<void>;
  /** Name of the hidden input carrying the id to delete */
  hiddenName: string;
  /** Value of the hidden input (the id to delete) */
  hiddenValue: string;
  /** Confirmation message shown in the browser confirm() dialog */
  confirmMessage: string;
  label?: string;
}

/**
 * Delete button that renders a <form> bound to a server action and shows a
 * confirm() dialog before submitting. Must be a Client Component because the
 * onClick handler cannot be passed from a Server Component to a Client
 * Component (Next.js serialization restriction).
 */
export function ConfirmDeleteButton({
  action,
  hiddenName,
  hiddenValue,
  confirmMessage,
  label = 'ลบ',
}: ConfirmDeleteButtonProps) {
  return (
    <form action={action}>
      <input type="hidden" name={hiddenName} value={hiddenValue} />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        className="border-rose-200 text-rose-600 hover:bg-rose-50"
        onClick={(e) => {
          if (!confirm(confirmMessage)) {
            e.preventDefault();
          }
        }}
      >
        <Trash2 className="h-4 w-4" />
        {label}
      </Button>
    </form>
  );
}