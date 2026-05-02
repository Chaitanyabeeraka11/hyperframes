import { templates } from "./db.js";

export function seedTemplates() {
  const initialTemplates = [
    {
      id: "kinetic-type",
      name: "Kinetic Type",
      category: "typography",
      description: "Bold, fast-paced kinetic typography animation.",
      thumbnail: "",
      html_path: "../registry/examples/kinetic-type/index.html",
      format: "horizontal",
      width: 1920,
      height: 1080,
      duration: 15,
      tags: '["typography", "fast", "bold"]'
    },
    {
      id: "product-promo",
      name: "Product Promo",
      category: "marketing",
      description: "Sleek product promotional video with continuous canvas transitions.",
      thumbnail: "",
      html_path: "../registry/examples/product-promo/index.html",
      format: "horizontal",
      width: 1920,
      height: 1080,
      duration: 20,
      tags: '["product", "promo", "marketing"]'
    },
    {
      id: "swiss-grid",
      name: "Swiss Grid",
      category: "layout",
      description: "Clean, structured Swiss grid layout with smooth sliding transitions.",
      thumbnail: "",
      html_path: "../registry/examples/swiss-grid/index.html",
      format: "horizontal",
      width: 1920,
      height: 1080,
      duration: 16.5,
      tags: '["grid", "clean", "minimal"]'
    },
    {
      id: "warm-grain",
      name: "Warm Grain",
      category: "aesthetic",
      description: "Warm, textured aesthetic with paper grain and subtle movements.",
      thumbnail: "",
      html_path: "../registry/examples/warm-grain/index.html",
      format: "horizontal",
      width: 1920,
      height: 1080,
      duration: 17,
      tags: '["warm", "texture", "aesthetic"]'
    }
  ];

  for (const t of initialTemplates) {
    templates.upsert(t);
  }
}
