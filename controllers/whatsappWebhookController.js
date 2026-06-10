const QuotationReply = require("../models/QuotationReply");
const Supplier = require("../models/suppliersListModel");
const Quotation = require("../models/Quotation");
const { sendWhatsAppText } = require("../services/metaWhatsAppService");

/* ------------------------------------------------ */
/* NORMALIZE PHONE */
/* ------------------------------------------------ */

const normalizePhone = (from) => {
  if (!from) return "";

  let num = String(from).replace(/\D/g, "");

  if (num.length > 10) {
    num = num.slice(-10);
  }

  return num;
};


/* ------------------------------------------------ */
/* WEBHOOK VERIFICATION */
/* ------------------------------------------------ */

exports.verifyWebhook = (req, res) => {

  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

  const mode =
    req.query["hub.mode"] || req.query["hub_mode"];

  const token =
    req.query["hub.verify_token"] || req.query["hub_verify_token"];

  const challenge =
    req.query["hub.challenge"] || req.query["hub_challenge"];

  console.log("Webhook verification request:", { mode, token });

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    return res.status(200).send(challenge);
  }

  console.log("❌ Verification failed");

  return res.sendStatus(403);
};


/* ------------------------------------------------ */
/* HANDLE INCOMING MESSAGE */
/* ------------------------------------------------ */

exports.handleIncomingMessage = async (req, res) => {

  try {

    console.log("Incoming WhatsApp payload:",
      JSON.stringify(req.body, null, 2)
    );

    const message =
      req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) return res.status(200).send("OK");

    if (!message.text) return res.status(200).send("OK");

    const body = message.text.body.trim();
    const phone = message.from;

    if (!phone || !body) return res.status(200).send("OK");

    const normalizedPhone = normalizePhone(phone);

    /* ---------------- FIND SUPPLIER ---------------- */

    const supplier = await Supplier.findOne({
      mobileNo: { $regex: normalizedPhone }
    });

    if (!supplier) return res.status(200).send("OK");


    /* ---------------- PARSE MESSAGE ---------------- */

    const lines = body.split("\n")
      .map(l => l.trim())
      .filter(Boolean);

    const reqLine =
      lines.find(l => l.toUpperCase().startsWith("REQ:"));

    const batchLine =
      lines.find(l => l.toUpperCase().startsWith("BATCH:"));

    if (!reqLine || !batchLine) {

      await safeReply(
        normalizedPhone,
`❌ Invalid format.

Please reply like this:

REQ: XXXXX
BATCH: XX

1. PARTNO
UNIT: PCS
RATE: 45`
      );

      return res.status(200).send("OK");
    }

    const requisitionNo =
      Number(reqLine.split(":")[1]);

    const batchNo =
      Number(batchLine.split(":")[1]);


    /* ---------------- FIND QUOTATION ---------------- */

    const quotation = await Quotation.findOne({
      requisitionNo,
      batchNo,
      "suppliers.supplierId": supplier._id
    });

    if (!quotation) {

      await safeReply(
        normalizedPhone,
        `❌ No active quotation found\nREQ:${requisitionNo}\nBATCH:${batchNo}`
      );

      return res.status(200).send("OK");
    }

    if (quotation.expiryDate && new Date() > quotation.expiryDate) {

      await safeReply(
        normalizedPhone,
        "⛔ Quotation validity expired."
      );

      return res.status(200).send("OK");
    }

    const requisitionId =
      quotation.requisition || quotation.requisitionId;


    /* ---------------- PARSE ITEMS ---------------- */

    let partNo = null;
    let unit = "";

    let saved = 0;

    let missingBoth = [];
    let missingUnit = [];
    let missingRate = [];

    const bulkOps = [];

    for (const line of lines) {

      const upper = line.toUpperCase();

      /* Detect part number */

      if (/^\d+\.\s*\d+/.test(line)) {

        partNo = line.replace(/^\d+\.\s*/, "").trim();
        unit = "";
        continue;
      }

      /* UNIT */

      if (upper.startsWith("UNIT")) {

        unit = line.split(":")[1]?.trim() || "";
        continue;
      }

      /* RATE */

      if (upper.startsWith("RATE")) {

        const rate = Number(line.split(":")[1]?.trim());

        if (!partNo) continue;

        const hasUnit = !!unit;
        const hasRate = rate && rate > 0;

        if (!hasUnit && !hasRate) {
          missingBoth.push(partNo);
          partNo = null;
          continue;
        }

        if (!hasUnit) {
          missingUnit.push(partNo);
          partNo = null;
          continue;
        }

        if (!hasRate) {
          missingRate.push(partNo);
          partNo = null;
          continue;
        }

        /* DUPLICATE CHECK */

        const existingSame = await QuotationReply.findOne({
          requisitionId,
          supplierId: supplier._id,
          batchNo,
          partNo,
          unit: { $regex: `^${unit}$`, $options: "i" },
          rate: Number(rate)
        });

        if (existingSame) {

          await safeReply(
            normalizedPhone,
`⚠️ Same rate already captured

Part: ${partNo}
UNIT: ${unit}
RATE: ${rate}`
          );

          partNo = null;
          continue;
        }

        /* REVISION */

        const lastRevision = await QuotationReply
          .findOne({
            requisitionId,
            supplierId: supplier._id,
            batchNo,
            partNo
          })
          .sort({ revision: -1 });

        const newRevision =
          lastRevision ? lastRevision.revision + 1 : 1;

        bulkOps.push({
          insertOne: {
            document: {
              requisitionId,
              supplierId: supplier._id,
              batchNo,
              partNo,
              unit,
              rate,
              status: "Received",
              revision: newRevision,
              source: "WhatsApp",
              receivedAt: new Date()
            }
          }
        });

        saved++;

        partNo = null;
      }
    }


    /* ---------------- INVALID FORMAT FALLBACK ---------------- */

    if (saved === 0 && bulkOps.length === 0) {

      await safeReply(
        normalizedPhone,
`❌ No quotation data detected.

Reply like this:

REQ: ${requisitionNo}
BATCH: ${batchNo}

1. PARTNO
UNIT: PCS
RATE: 45`
      );

      return res.status(200).send("OK");
    }


    /* ---------------- SAVE REPLIES ---------------- */

    if (bulkOps.length) {
      await QuotationReply.bulkWrite(bulkOps);
    }


    /* ---------------- UPDATE SUPPLIER STATUS ---------------- */

    if (saved > 0) {

      await Quotation.updateOne(
        {
          _id: quotation._id,
          "suppliers.supplierId": supplier._id
        },
        {
          $set: {
            "suppliers.$.status": "Replied",
            "suppliers.$.repliedAt": new Date()
          }
        }
      );
    }


    /* ---------------- UPDATE QUOTATION STATUS ---------------- */

    const refreshed = await Quotation.findById(quotation._id);

    if (!refreshed) return res.status(200).send("OK");

    const total = refreshed.suppliers.length;

    const replied =
      refreshed.suppliers.filter(
        s => s.status === "Replied"
      ).length;

    let status = "Sent";

    if (replied > 0 && replied < total)
      status = "Partially-Replied";

    if (replied === total)
      status = "Completed";

    await Quotation.updateOne(
      { _id: quotation._id },
      { $set: { status } }
    );


    /* ---------------- SUCCESS MESSAGE ---------------- */

    if (saved > 0) {

      await safeReply(
        normalizedPhone,
`✅ Quotation recorded successfully

Items captured: ${saved}`
      );
    }

    return res.status(200).send("OK");

  } catch (err) {

    console.error("Webhook Error:", err);

    return res.status(200).send("OK");
  }
};


/* ------------------------------------------------ */
/* SAFE AUTO REPLY */
/* ------------------------------------------------ */

async function safeReply(phone, message) {

  try {

    let num = String(phone).replace(/\D/g, "");

    if (num.length === 10) {
      num = `91${num}`;
    }

    await sendWhatsAppText({
      to: num,
      message
    });

  } catch (err) {

    console.error("⚠️ Auto-reply failed:", err.message);
  }
}

exports.handleIncomingMessage11 = async (req, res) => {
  try {
    const body = req.body.Body?.trim();
    const phone = req.body.WaId;

    if (!phone || !body) return res.status(200).send("OK");

    const normalizedPhone = normalizePhone(phone);

    // 1️⃣ Find supplier
    const supplier = await Supplier.findOne({
      mobileNo: { $elemMatch: { $regex: normalizedPhone } }
    });

    if (!supplier) return res.status(200).send("OK");

    // 2️⃣ Parse lines
    const lines = body.split("\n").map(l => l.trim()).filter(Boolean);

    const reqLine = lines.find(l => l.toUpperCase().startsWith("REQ:"));
    const batchLine = lines.find(l => l.toUpperCase().startsWith("BATCH:"));

    if (!reqLine || !batchLine) {
      await safeReply(
        normalizedPhone,
        "❌ Invalid format.\n\nPlease copy the original message and fill UNIT and RATE only."
      );
      return res.status(200).send("OK");
    }

    const requisitionNo = Number(reqLine.split(":")[1].trim());
    const batchNo = Number(batchLine.split(":")[1].trim());

    // 3️⃣ Find quotation
    const quotation = await Quotation.findOne({
      requisitionNo,
      batchNo,
      "suppliers.supplierId": supplier._id
    });

    if (!quotation) {
      await safeReply(
        normalizedPhone,
        `❌ No active quotation found.\nREQ: ${requisitionNo}\nBATCH: ${batchNo}`
      );
      return res.status(200).send("OK");
    }

    const requisitionId = quotation.requisition || quotation.requisitionId;

    const supplierEntry = quotation.suppliers.find(
      s => s.supplierId.toString() === supplier._id.toString()
    );

    let currentPartNo = null;
    let currentUnit = "";
    let savedCount = 0;
    let updatedZeroCount = 0;
    let duplicateParts = [];
    let rejectedForMissingUnit = [];

    // 4️⃣ Parse PART + UNIT + RATE
    for (const line of lines) {
      const upper = line.toUpperCase();

      // 📦 Part line: "1. 23610"
      if (/^\d+\.\s*\d+/.test(line)) {
        currentPartNo = line.replace(/^\d+\.\s*/, "").trim();
        currentUnit = "";
        continue;
      }

      // 📏 Unit line
      if (upper.startsWith("UNIT")) {
        currentUnit = line.split(":")[1]?.trim() || "";
        continue;
      }

      // 💰 Rate line
      if (upper.startsWith("RATE")) {
        const rate = Number(line.split(":")[1]?.trim());
        if (!currentPartNo || isNaN(rate)) continue;

        // ❌ Reject if UNIT missing
        if (!currentUnit) {
          rejectedForMissingUnit.push(currentPartNo);
          currentPartNo = null;
          continue;
        }

        const existing = await QuotationReply.findOne({
          requisitionId,
          supplierId: supplier._id,
          batchNo,
          partNo: currentPartNo
        });

        // 🟢 Update zero rate
        if (existing && existing.rate === 0 && rate > 0) {
          existing.rate = rate;
          existing.unit = currentUnit;
          existing.status = "Received";
          existing.receivedAt = new Date();
          await existing.save();

          updatedZeroCount++;
          currentPartNo = null;
          continue;
        }

        // 🔴 Duplicate final rate
        if (existing && existing.rate > 0) {
          duplicateParts.push(currentPartNo);
          currentPartNo = null;
          continue;
        }

        // 🆕 Create new reply
        if (!existing) {
          const replyStatus = rate === 0 ? "Pending" : "Received";

          await QuotationReply.create({
            requisitionId,
            supplierId: supplier._id,
            batchNo,
            partNo: currentPartNo,
            unit: currentUnit,
            rate,
            status: replyStatus,
             source: "WhatsApp",        // ✅ CAPTURE SOURCE HERE
            receivedAt: new Date()
          });

          savedCount++;
        }

        currentPartNo = null;
      }
    }

    // 5️⃣ Update supplier status
    if (
      supplierEntry &&
      supplierEntry.status === "Sent" &&
      (savedCount > 0 || updatedZeroCount > 0)
    ) {
      await Quotation.updateOne(
        { _id: quotation._id, "suppliers.supplierId": supplier._id },
        {
          $set: {
            "suppliers.$.status": "Replied",
            "suppliers.$.repliedAt": new Date()
          }
        }
      );
    }

    // 6️⃣ Update quotation status
    const refreshedQuotation = await Quotation.findById(quotation._id);

    const totalSuppliers = refreshedQuotation.suppliers.length;
    const repliedSuppliers = refreshedQuotation.suppliers.filter(
      s => s.status === "Replied"
    ).length;

    let quotationStatus = "Sent";

    if (repliedSuppliers > 0 && repliedSuppliers < totalSuppliers)
      quotationStatus = "Partially-Replied";

    if (repliedSuppliers === totalSuppliers)
      quotationStatus = "Completed";

    await Quotation.updateOne(
      { _id: quotation._id },
      { $set: { status: quotationStatus } }
    );

    // 7️⃣ Confirmation messages

    if (savedCount > 0 || updatedZeroCount > 0) {
      await safeReply(
        normalizedPhone,
        `✅ Quotation received successfully!

REQ: ${requisitionNo}
BATCH: ${batchNo}

New items: ${savedCount}
Updated from zero: ${updatedZeroCount}

Thank you.`
      );
    }

    if (rejectedForMissingUnit.length) {
      await safeReply(
        normalizedPhone,
        `❌ UNIT missing for parts:
${rejectedForMissingUnit.join(", ")}

Please resend with UNIT filled.`
      );
    }

    if (duplicateParts.length) {
      await safeReply(
        normalizedPhone,
        `⚠️ Rates already submitted earlier for:
${duplicateParts.join(", ")}

Further changes are not allowed.`
      );
    }

    return res.status(200).send("OK");

  } catch (err) {
    console.error("❌ WhatsApp Webhook Error:", err);
    return res.status(200).send("OK");
  }
};
