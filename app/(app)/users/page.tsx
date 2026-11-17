import { PageHeader } from "@/components/ui";
import { NewCompanyForm, UserAccess } from "@/components/user-access";
import { requireSuperAdmin, SUPER_ADMIN_LABEL } from "@/lib/auth";
import { listCompanies, listProfiles } from "@/lib/data";
import { formatDate } from "@/lib/format";

export default async function UsersPage() {
  const me = await requireSuperAdmin();
  const [profiles, companies] = await Promise.all([listProfiles(), listCompanies()]);
  const waiting = profiles.filter((p) => !p.is_super_admin && (p.role === "pending" || !p.company_id)).length;

  return (
    <>
      <PageHeader
        title="ผู้ใช้งาน"
        subtitle={`ทั้งหมด ${profiles.length} บัญชี · ${companies.length} บริษัท${waiting ? ` · รออนุมัติ ${waiting} บัญชี` : ""}`}
      />
      <div className="card mb-4 grid gap-1 p-4 text-sm text-muted">
        <p>
          ข้อมูลของแต่ละบริษัท (ลูกค้า สินค้า เอกสาร) แยกขาดจากกัน บัญชีจะเห็นเฉพาะข้อมูลของบริษัทที่กำหนดให้เท่านั้น
          ส่วนบัญชีผู้ดูแลระบบใช้จัดการผู้ใช้อย่างเดียว ไม่เห็นข้อมูลของบริษัทใด
        </p>
        <p>
          <span className="font-medium text-ink">ผู้ดูแลบริษัท (Admin)</span> ทำได้ทุกอย่างในบริษัท รวมถึงแก้ข้อมูลบริษัทและลบข้อมูล ·{" "}
          <span className="font-medium text-ink">User</span> สร้างและแก้ไขเอกสาร ลูกค้า และสินค้าได้ แต่ลบไม่ได้ ·{" "}
          <span className="font-medium text-ink">รออนุมัติ</span> เข้าดูข้อมูลไม่ได้
        </p>
        <p>ผู้ใช้ใหม่สมัครเองได้ที่หน้า “สมัครใช้งาน” แล้วจะรออนุมัติจนกว่าจะกำหนดบริษัทและสิทธิ์ให้</p>
      </div>

      <div className="card mb-4 p-4">
        <NewCompanyForm />
        {companies.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2 text-sm">
            {companies.map((c) => (
              <li key={c.id} className="rounded-full bg-accent-soft px-3 py-1 text-accent">
                {c.name} <span className="text-accent/70">· {c.member_count} บัญชี</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card table-scroll">
        <table className="data-table min-w-[760px]">
          <thead>
            <tr>
              <th>ชื่อ</th>
              <th>อีเมล</th>
              <th>สมัครเมื่อ</th>
              <th className="text-right">บริษัท · สิทธิ์</th>
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
                  {profile.is_super_admin ? (
                    <span className="text-sm text-muted">{SUPER_ADMIN_LABEL}</span>
                  ) : (
                    <UserAccess
                      userId={profile.id}
                      email={profile.email}
                      role={profile.role}
                      companyId={profile.company_id}
                      companies={companies}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
