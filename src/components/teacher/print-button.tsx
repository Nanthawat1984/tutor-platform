'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PrintButtonProps {
  label?: string;
}

/** เปิด dialog พิมพ์ของเบราว์เซอร์ — เลือก "บันทึกเป็น PDF" เพื่อได้ไฟล์ PDF */
export default function PrintButton({ label = 'พิมพ์ / บันทึกเป็น PDF' }: PrintButtonProps) {
  return (
    <Button onClick={() => window.print()} className="w-full sm:w-auto">
      <Printer className="h-4 w-4" /> {label}
    </Button>
  );
}