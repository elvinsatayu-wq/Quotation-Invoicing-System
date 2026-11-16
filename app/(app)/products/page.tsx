import Link from "next/link";
import { DeleteButton } from "@/components/delete-button";
import { PageHeader } from "@/components/ui";
import { deleteProduct } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { listProducts } from "@/lib/data";
import { formatMoney } from "@/lib/format";

export default async function ProductsPage() {
  const [products, user] = await Promise.all([listProducts(), requireUser()]);

  return (
    <>
      <PageHeader
        title="สินค้า/บริการ"
        subtitle={`ทั้งหมด ${products.length} รายการ`}
        actions={
          <Link href="/products/new" className="btn btn-primary">
            เพิ่มสินค้า
          </Link>
        }
      />
      <div className="card table-scroll">
        <table className="data-table min-w-[720px]">
          <thead>
            <tr>
              <th>รหัส</th>
              <th>ชื่อสินค้า/บริการ</th>
              <th>หน่วยนับ</th>
              <th className="num">ราคา (บาท)</th>
              <th>VAT</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td className="whitespace-nowrap tabular-nums">{product.code}</td>
                <td>
                  <Link href={`/products/${product.id}`} className="font-medium text-accent hover:underline">
                    {product.name}
                  </Link>
                </td>
                <td>{product.unit}</td>
                <td className="num">{formatMoney(product.unit_price)}</td>
                <td className="whitespace-nowrap">{product.vat_applicable ? "คิด VAT" : "ไม่คิด"}</td>
                <td>
                  <div className="flex items-start justify-end gap-2">
                    <Link href={`/products/${product.id}`} className="btn">
                      แก้ไข
                    </Link>
                    {user.role === "admin" && (
                      <DeleteButton name={product.name} action={deleteProduct.bind(null, product.id)} />
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted">
                  ยังไม่มีสินค้า
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
