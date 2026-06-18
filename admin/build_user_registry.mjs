import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const workbook = Workbook.create();
const guide = workbook.worksheets.add("運用ガイド");
const registry = workbook.worksheets.add("ユーザー管理台帳");

guide.mergeCells("A1:F1");
guide.getRange("A1").values = [["AI×MUS ユーザー管理台帳"]];
guide.getRange("A1:F1").format = {
  fill: "#182015",
  font: { bold: true, color: "#C8F45B", size: 18 },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
guide.getRange("A1:F1").format.rowHeight = 34;
guide.getRange("A3:B8").values = [
  ["項目", "内容"],
  ["正本", "backend/data/user_registry.csv（会員登録時に自動追記）"],
  ["パスワード", "台帳には保存しません。DB内の復元不能なScryptハッシュのみです。"],
  ["会員番号", "AIMUS-00000001形式で自動発行"],
  ["ログイン復旧", "登録メールへ期限付きパスワード再設定リンクを送信"],
  ["更新日", "2026-06-15"],
];
guide.getRange("A3:B3").format = {
  fill: "#C8F45B",
  font: { bold: true, color: "#11130F" },
};
guide.getRange("A3:B8").format.borders = {
  all: { color: "#D7DDD2", style: "continuous", weight: 1 },
};
guide.getRange("A:A").format.columnWidth = 18;
guide.getRange("B:B").format.columnWidth = 70;
guide.getRange("B4:B8").format.wrapText = true;

registry.getRange("A1:N1").values = [[
  "会員番号",
  "内部ユーザーID",
  "ログインID",
  "メールアドレス",
  "ユーザーネーム",
  "目的",
  "現在体重kg",
  "目標体重kg",
  "目標",
  "ベンチ1RM",
  "スクワット1RM",
  "デッドリフト1RM",
  "通知許可",
  "登録日時",
]];
registry.getRange("A1:N1").format = {
  fill: "#182015",
  font: { bold: true, color: "#C8F45B" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  wrapText: true,
};
registry.getRange("A1:N1").format.rowHeight = 30;
registry.freezePanes.freezeRows(1);
registry.getRange("A2:N2").values = [["", "", "", "", "", "", "", "", "", "", "", "", "", ""]];
const widths = [18, 38, 20, 30, 20, 22, 14, 14, 36, 14, 14, 16, 12, 24];
widths.forEach((width, index) => {
  registry.getRangeByIndexes(0, index, 200, 1).format.columnWidth = width;
});
registry.getRange("G2:H200").format.numberFormat = "0.0";
registry.getRange("J2:L200").format.numberFormat = "0.0";
registry.getRange("N2:N200").format.numberFormat = "yyyy-mm-dd hh:mm";

const outputDir = new URL(".", import.meta.url);
await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(new URL("AIxMUS_user_registry.xlsx", outputDir));
const preview = await workbook.render({
  sheetName: "運用ガイド",
  range: "A1:F8",
  scale: 1.5,
});
await fs.writeFile(
  new URL("AIxMUS_user_registry_preview.png", outputDir),
  Buffer.from(await preview.arrayBuffer()),
);

const inspection = await workbook.inspect({
  kind: "table",
  range: "運用ガイド!A1:B8",
  include: "values,formulas",
  tableMaxRows: 10,
  tableMaxCols: 4,
});
console.log(inspection.ndjson);
