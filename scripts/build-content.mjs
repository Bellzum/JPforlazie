import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const dataDir = path.join(rootDir, "data");
const itemSourceFile = "jlpt_n3_n2_quiz_content_300_rows_v1.csv";

const requirements = {
  N3: {
    label: "Intermediate",
    vocabTarget: 1800,
    vocabRange: "about 1,500 to 1,800 words",
    grammarTarget: 200,
    grammarRange: "about 180 to 200 grammar items",
    focus: "Conversational Japanese, casual opinions, short messages, and daily announcements.",
    sourceTypes: ["Daily announcements", "Short notices", "Casual opinions", "Everyday conversations"]
  },
  N2: {
    label: "Upper-intermediate",
    vocabTarget: 6000,
    vocabRange: "about 6,000 words",
    grammarTarget: 200,
    grammarRange: "about 200 grammar items",
    focus: "Editorials, academic writing, formal speeches, public notices, and business Japanese.",
    sourceTypes: ["Editorials", "Academic passages", "Formal speeches", "Business notices"]
  }
};

function parseCsv(text) {
  text = text.replace(/^\uFEFF/, "");
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

function toRecords(rows, fileName) {
  const [headers, ...body] = rows;
  if (!headers?.length) throw new Error(`${fileName} is empty.`);

  return body.map((row, rowIndex) => {
    if (row.length !== headers.length) {
      throw new Error(`${fileName} row ${rowIndex + 2} has ${row.length} columns, expected ${headers.length}.`);
    }

    return Object.fromEntries(headers.map((header, index) => [header, row[index]]));
  });
}

function requireFields(record, fields, fileName, rowNumber) {
  const missing = fields.filter((field) => !record[field]);
  if (missing.length) {
    throw new Error(`${fileName} row ${rowNumber} missing required fields: ${missing.join(", ")}.`);
  }
}

const categoriesCsv = await readFile(path.join(dataDir, "categories.csv"), "utf8");
const itemsCsv = await readFile(path.join(dataDir, itemSourceFile), "utf8");
const categories = toRecords(parseCsv(categoriesCsv), "categories.csv");
const items = toRecords(parseCsv(itemsCsv), "items.csv");
const categoryMap = new Map();

categories.forEach((category, index) => {
  requireFields(category, ["id", "level", "category", "description"], "categories.csv", index + 2);
  if (!requirements[category.level]) {
    throw new Error(`categories.csv row ${index + 2} has unsupported level: ${category.level}.`);
  }

  categoryMap.set(category.id, {
    id: category.id,
    level: category.level,
    category: category.category,
    description: category.description,
    items: []
  });
});

items.forEach((item, index) => {
  requireFields(
    item,
    ["categoryId", "type", "target", "meaning", "example", "exampleMeaning", "question", "optionA", "optionB", "optionC", "optionD", "answer"],
    "items.csv",
    index + 2
  );

  const category = categoryMap.get(item.categoryId);
  if (!category) {
    throw new Error(`items.csv row ${index + 2} has unknown categoryId: ${item.categoryId}.`);
  }

  if (!["vocab", "grammar"].includes(item.type)) {
    throw new Error(`items.csv row ${index + 2} has unsupported type: ${item.type}.`);
  }

  const answer = Number(item.answer);
  if (!Number.isInteger(answer) || answer < 0 || answer > 3) {
    throw new Error(`items.csv row ${index + 2} answer must be 0, 1, 2, or 3.`);
  }

  category.items.push({
    type: item.type,
    target: item.target,
    reading: item.reading || undefined,
    meaning: item.meaning,
    example: item.example,
    exampleMeaning: item.exampleMeaning,
    question: item.question,
    options: [item.optionA, item.optionB, item.optionC, item.optionD],
    answer
  });
});

const content = {
  generatedAt: new Date().toISOString(),
  requirements,
  categories: [...categoryMap.values()]
};

await mkdir(dataDir, { recursive: true });
await writeFile(path.join(dataDir, "content.json"), `${JSON.stringify(content, null, 2)}\n`);

const summary = content.categories.reduce(
  (totals, category) => {
    totals.categories += 1;
    totals.items += category.items.length;
    totals.vocab += category.items.filter((item) => item.type === "vocab").length;
    totals.grammar += category.items.filter((item) => item.type === "grammar").length;
    return totals;
  },
  { categories: 0, items: 0, vocab: 0, grammar: 0 }
);

console.log(`Built data/content.json`);
console.log(`${summary.categories} categories, ${summary.items} items, ${summary.vocab} vocab, ${summary.grammar} grammar`);
