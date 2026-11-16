import { notFound } from "next/navigation";
import { CustomerForm } from "@/components/customer-form";
import { PageHeader } from "@/components/ui";
import { getCustomer } from "@/lib/data";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer) notFound();

  return (
    <div className="max-w-2xl">
      <PageHeader title="แก้ไขลูกค้า" subtitle={customer.name} />
      <CustomerForm key={customer.id} customer={customer} />
    </div>
  );
}
