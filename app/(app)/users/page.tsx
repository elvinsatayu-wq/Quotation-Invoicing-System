import { PageHeader } from "@/components/ui";
import { UserRoleSelect } from "@/components/user-role-select";
import { requireAdmin } from "@/lib/auth";
import { listProfiles } from "@/lib/data";
import { formatDate } from "@/lib/format";

export default async function UsersPage() {
  const me = await requireAdmin();
  const profiles = await listProfiles();
  const waiting = profiles.filter((p) => p.role === "pending").length;

  return (
    <>
      <PageHeader
        title="ผู้ใช้งาน"
        subtitle={`ทั้งหมด ${profiles.length} บัญชี${waiting ? ` · รออนุมัติ ${waiting} บัญชี` : ""}`}
      />
      <div className="card mb-4 p-4 text-sm text-muted">
        <p>
          <span className="font-medium text-ink">Admin</span> ทำได้ทุกอย่าง รวมถึงแก้ข้อมูลบริษัท ลบข้อมูล และจัดการผู้ใช้ ·{" "}
          <span className="font-medium text-ink">User</span> ดูข้อมูลทั้งหมด สร้างและแก้ไขเอกสาร ลูกค้า และสินค้าได้ แต่ลบไม่ได้ ·{" "}
          <span className="font-medium text-ink">รออนุมัติ</span> เข้าดูข้อมูลไม่ได้
        </p>
        <p className="mt-1">ผู้ใช้ใหม่สมัครเองได้ที่หน้า “สมัครใช้งาน” แล้วจะอยู่ในสถานะรออนุมัติจนกว่าผู้ดูแลจะกำหนดสิทธิ์ให้</p>
      </div>
      <div className="card table-scroll">
        <table className="data-table min-w-[640px]">
          <thead>
            <tr>
              <th>ชื่อ</th>
              <th>อีเมล</th>
              <th>สมัครเมื่อ</th>
              <th className="text-right">สิทธิ์</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => (
              <tr key={profile.id}>
                <td>
                  {profile.full_name || "–"}
                  {profile.id === me.id && <span className="ml-2 text-xs text-muted">(คุณ)</span>}
                </td>
                <td>{profile.email}</td>
                <td className="whitespace-nowrap">{formatDate(profile.created_at.slice(0, 10))}</td>
                <td className="text-right">
                  <UserRoleSelect userId={profile.id} email={profile.email} role={profile.role} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
