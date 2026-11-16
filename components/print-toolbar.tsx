"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";

/** Screen-only bar above the A4 preview. The browser's print dialog can also save as PDF. */
export function PrintToolbar({
  backHref,
  fileName,
  extra,
}: {
  backHref: string;
  fileName: string;
  extra?: ReactNode;
}) {
  // Browsers suggest the page title as the PDF file name.
  useEffect(() => {
    const previous = document.title;
    document.title = fileName;
    return () => {
      document.title = previous;
    };
  }, [fileName]);

  return (
    <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2 px-4 print:hidden">
      <Link href={backHref} className="btn">
        ← กลับไปที่เอกสาร
      </Link>
      {extra}
      <div className="flex items-center gap-3">
        <p className="hidden text-sm text-muted md:block">
          เลือกปลายทาง “บันทึกเป็น PDF” ในหน้าต่างพิมพ์เพื่อได้ไฟล์ PDF
        </p>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          พิมพ์ / บันทึก PDF
        </button>
      </div>
    </div>
  );
}
