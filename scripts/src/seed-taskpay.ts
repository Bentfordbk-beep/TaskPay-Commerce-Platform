import { categoriesTable, db, platformSettingsTable, pool } from "@workspace/db";

const categoryNames: Record<string, string[]> = {
  physical: [
    "Fashion and Clothing",
    "Shoes and Footwear",
    "Bags and Accessories",
    "Phones and Electronics",
    "Computers and Accessories",
    "Home and Living",
    "Beauty and Personal Care",
    "Health and Wellness",
    "Food and Beverages",
    "Books and Stationery",
    "Sports and Fitness",
    "Baby and Kids",
    "Other Physical Products",
  ],
  digital: [
    "E-books and Guides",
    "Online Courses",
    "Templates and Digital Files",
    "Graphics and Design Assets",
    "Software and Digital Tools",
    "Business and Marketing Resources",
    "Audio and Video Content",
    "Other Digital Products",
  ],
  course: [
    "Digital Skills",
    "Business",
    "Design",
    "Technology",
    "Personal Development",
    "Other Learning",
  ],
  event: [
    "Music and Entertainment",
    "Business and Networking",
    "Education and Workshops",
    "Technology",
    "Lifestyle and Community",
    "Other Events",
  ],
};

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

try {
  const rows = Object.entries(categoryNames).flatMap(([scope, names]) =>
    names.map((name) => ({ name, scope, slug: slugify(name) })),
  );

  await db
    .insert(categoriesTable)
    .values(rows)
    .onConflictDoNothing({
      target: [categoriesTable.scope, categoriesTable.slug],
    });
  await db
    .insert(platformSettingsTable)
    .values({ id: "primary" })
    .onConflictDoNothing();

  console.log(`Seeded ${rows.length} TaskPay categories and platform defaults.`);
} finally {
  await pool.end();
}
