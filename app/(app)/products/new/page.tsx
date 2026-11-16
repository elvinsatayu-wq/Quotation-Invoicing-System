import { ProductForm } from "@/components/product-form";
import { PageHeader } from "@/components/ui";

export default function NewProductPage() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="เพิ่มสินค้า/บริการ" />
      <ProductForm />
    </div>
  );
}
