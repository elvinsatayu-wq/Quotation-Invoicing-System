import { CompanyForm } from "@/components/company-form";
import { PageHeader } from "@/components/ui";
import { getCompany } from "@/lib/data";

export default async function CompanyPage() {
  const company = await getCompany();

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="ข้อมูลบริษัท"
        subtitle="ผู้ออกเอกสาร ใช้กับใบเสนอราคาและใบแจ้งหนี้ทุกใบ รวมถึงเอกสารที่ออกไปแล้ว"
      />
      <CompanyForm company={company} />
    </div>
  );
}
