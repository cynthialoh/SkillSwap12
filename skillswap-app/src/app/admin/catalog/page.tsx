import { getPrismaClient } from "@/lib/db/prisma";
import { AdminNavigation, AdminPageHeader, requireAdminPage } from "../admin-shared";
import { createSkillCategory, setSkillCategoryActive } from "../operations-actions";

export default async function AdminCatalogPage() {
  await requireAdminPage();
  const categories = await getPrismaClient().skillCategory.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { _count: { select: { listings: true } } },
  });
  return (
    <main className="interaction-page admin-operations-page">
      <AdminPageHeader
        title="Marketplace catalog"
        description="Manage skill categories. Deactivation keeps existing references and prevents new discovery under that category."
      />
      <AdminNavigation current="/admin/catalog" />
      <section className="interaction-panel">
        <h2>Add category</h2>
        <form action={createSkillCategory} className="interaction-form admin-category-form">
          <label>
            Category name
            <input name="name" minLength={2} maxLength={80} required />
          </label>
          <label>
            Reason
            <textarea name="reason" minLength={20} maxLength={500} rows={2} required />
          </label>
          <button className="primary-button">Create category</button>
        </form>
      </section>
      <section className="interaction-panel">
        <h2>Categories</h2>
        {categories.length ? (
          <ul className="audit-list">
            {categories.map((category) => (
              <li key={category.id}>
                <strong>
                  {category.name} · {category.isActive ? "Active" : "Inactive"}
                </strong>
                <span>
                  /{category.slug} · {category._count.listings} skill listings
                </span>
                <form action={setSkillCategoryActive} className="interaction-form">
                  <input type="hidden" name="categoryId" value={category.id} />
                  <input type="hidden" name="active" value={String(!category.isActive)} />
                  <label>
                    {category.isActive ? "Deactivation" : "Reactivation"} reason
                    <textarea name="reason" minLength={20} maxLength={500} rows={2} required />
                  </label>
                  <button className="secondary-button">
                    {category.isActive ? "Deactivate" : "Reactivate"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">No categories are configured.</p>
        )}
      </section>
    </main>
  );
}
