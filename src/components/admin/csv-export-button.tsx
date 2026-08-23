'use client';

import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

interface CsvExportButtonProps {
  filename: string;
  headers: string[];
  rows: (string | number)[][];
  label?: string;
}

/** สร้างไฟล์ CSV (มี BOM สำหรับ Excel ภาษาไทย) จากข้อมูลที่ server ส่งมา */
export default function CsvExportButton({ filename, headers, rows, label = 'ดาวน์โหลด CSV' }: CsvExportButtonProps) {
  function download() {
    const escape = (v: string | number) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" onClick={download} className="w-full sm:w-auto">
      <Download className="h-4 w-4" /> {label}
    </Button>
  );
}