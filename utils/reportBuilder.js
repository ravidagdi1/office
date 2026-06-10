const { sendExcel } = require("./excelHelper");

exports.generateReport = async ({
  model,
  query = {},
  select = "",
  populate = [],
  mapFunction,
  fileName = "Report.xlsx",
  res,
  options = {}, // ✅ SAFE DEFAULT (no impact anywhere)
}) => {
  try {
    let dataQuery = model
      .find(query)
      .setOptions(options) // ✅ now always defined
      .select(select);

    // ✅ Apply populate
    populate.forEach((p) => {
      dataQuery = dataQuery.populate(p);
    });

    const items = await dataQuery.lean();

    let data = [];

    // ✅ Handle empty data
    if (!items || items.length === 0) {
      data = [{ Message: "No Data Found" }];
    } else {
      data = items.map((item, index) =>
        typeof mapFunction === "function"
          ? mapFunction(item, index)
          : item
      );
    }

    return sendExcel(res, data, fileName);

  } catch (error) {
    console.error("Report Builder Error:", error);

    return sendExcel(
      res,
      [{ Message: "Error generating report" }],
      fileName
    );
  }
};