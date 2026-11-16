import { notFound } from "next/navigation";
import { ProductForm } from "@/components/product-form";
import { PageHeader } from "@/components/ui";
import { getProduct } from "@/lib/data";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  return (
    <div className="max-w-2xl">
      <PageHeader title="แก้ไขสินค้า/บริการ" subtitle={product.name} />
      <ProductForm key={product.id} product={product} />
    </div>
  );
}
