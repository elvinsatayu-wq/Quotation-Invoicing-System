import Link from "next/link";
import { DeleteButton } from "@/components/delete-button";
import { PageHeader } from "@/components/ui";
import { deleteCustomer } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { listCustomers } from "@/lib/data";

export default async function CustomersPage() {
  const [customers, user] = await Promise.all([listCustomers(), requireUser()]);

  return (
    <>
      <PageHeader
        title="ลูกค้า"
        subtitle={`ทั้งหมด ${customers.length} ราย`}
        actions={
          <Link href="/customers/new" className="btn btn-primary">
            เพิ่มลูกค้า
          </Link>
        }
      />
      <div className="card table-scroll">
        <table className="data-table min-w-[800px]">
          <thead>
            <tr>
              <th>ชื่อลูกค้า</th>
              <th>เลขผู้เสียภาษี</th>
              <th>ผู้ติดต่อ</th>
              <th>โทรศัพท์</th>
              <th className="num">เครดิตเทอม</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id}>
                <td>
                  <Link href={`/customers/${customer.id}`} className="font-medium text-accent hover:underline">
                    {customer.name}
                  </Link>
                </td>
                <td className="tabular-nums">{customer.tax_id ?? "–"}</td>
                <td>{customer.contact_name ?? "–"}</td>
                <td className="whitespace-nowrap">{customer.phone ?? "–"}</td>
                <td className="num whitespace-nowrap">{customer.credit_term_days} วัน</td>
                <td>
                  <div className="flex items-start justify-end gap-2">
                    <Link href={`/customers/${customer.id}`} className="btn">
                      แก้ไข
                    </Link>
                    {user.role === "admin" && (
                      <DeleteButton name={customer.name} action={deleteCustomer.bind(null, customer.id)} />
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted">
                  ยังไม่มีลูกค้า
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
