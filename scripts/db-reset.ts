// Deletes the local SQLite database and recreates it with the sample data.
import { rmSync } from "node:fs";
import { DATABASE_FILE, openDatabase } from "../lib/server/db.ts";

try {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DATABASE_FILE + suffix, { force: true });
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "EBUSY" && (error as NodeJS.ErrnoException).code !== "EPERM") throw error;
  console.error("ลบฐานข้อมูลไม่ได้เพราะไฟล์ถูกใช้งานอยู่ กรุณาหยุด npm run dev / npm start ก่อน แล้วรันใหม่");
  process.exit(1);
}
openDatabase(DATABASE_FILE).close();
console.log(`สร้างฐานข้อมูลใหม่พร้อมข้อมูลตัวอย่างแล้ว: ${DATABASE_FILE}`);
