// utils/excelHelper.js

const XLSX = require("xlsx");

exports.sendExcel = (res, data, fileName = "Report.xlsx") => {
  try {
    const workbook = XLSX.utils.book_new();

    const worksheet = XLSX.utils.json_to_sheet(data);

    XLSX.utils.book_append_sheet(workbook, worksheet, "Report");

    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${fileName}`
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader("Content-Length", buffer.length);

    return res.end(buffer); // ✅ safest
  } catch (error) {
    console.error("Excel Generation Error:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to generate Excel file",
    });
  }
};