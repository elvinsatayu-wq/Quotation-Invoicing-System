"use client";

export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <div className="card mx-auto mt-10 max-w-md p-6 text-center">
      <h1 className="font-semibold">โหลดข้อมูลไม่สำเร็จ</h1>
      <p className="mt-2 text-sm text-muted">
        เกิดข้อผิดพลาดระหว่างอ่านฐานข้อมูลในเครื่อง ลองใหม่อีกครั้ง หรือดูรายละเอียดในหน้าต่าง terminal ที่รัน <code>npm run dev</code>
      </p>
      <button type="button" className="btn btn-primary mt-4" onClick={() => retry()}>
        ลองใหม่
      </button>
    </div>
  );
}
