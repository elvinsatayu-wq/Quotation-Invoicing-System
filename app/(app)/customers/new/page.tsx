import { CustomerForm } from "@/components/customer-form";
import { PageHeader } from "@/components/ui";

export default function NewCustomerPage() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="เพิ่มลูกค้า" />
      <CustomerForm />
    </div>
  );
}
