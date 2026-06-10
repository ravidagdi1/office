const Quotation = require("../models/Quotation");
const QuotationReply = require("../models/QuotationReply");
//const { sendWhatsApp } = require("../services/whatsappService");
//const { sendWhatsApp } = require("../services/metaWhatsAppService");
const { sendWhatsAppTemplate } = require("../services/metaWhatsAppService");
const QuotationApprovalLog = require("../models/quotationApprovalLogModel");
const Request = require("../models/requestedModel");
const SupplierRateMaster = require("../models/SupplierRateMaster");



const pLimit = require("p-limit");
const limit = pLimit(10);

exports.sendQuotationWhatsApp = async (req, res) => {
  try {

    const { requisitionId, requisitionNo, items, suppliers } = req.body;

    if (!items?.length) {
      return res.status(400).json({
        success: false,
        message: "No items selected"
      });
    }

    if (!suppliers?.length) {
      return res.status(400).json({
        success: false,
        message: "No suppliers selected"
      });
    }

    // Batch number
    const lastBatch = await Quotation
      .findOne({ requisitionId })
      .sort({ batchNo: -1 });

    const batchNo = lastBatch ? lastBatch.batchNo + 1 : 1;

    // Expiry
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 7);

    // Save quotation
    const quotation = await Quotation.create({
      requisitionId,
      requisitionNo,
      batchNo,
      expiryDate,
      items,
      suppliers: suppliers.map(s => ({
        supplierId: s.supplierId,
        supplierName: s.name,
        phone: s.phone,
        status: "Sent"
      })),
      createdBy: req.user._id
    });

    // Build item text
    const itemText = items.map((item, index) =>
      `${index + 1}. ${item.partNo} ${item.description} Qty:${item.requiredQty}`
    ).join(" | ");

    // Send messages
    const jobs = suppliers.map(supplier =>
      limit(async () => {

        let phone = supplier.phone.toString().replace(/\D/g, "");

        if (phone.startsWith("0")) phone = phone.substring(1);
        if (!phone.startsWith("91")) phone = "91" + phone;

        try {

          await sendWhatsAppTemplate({
            to: phone,
            requisitionNo,
            batchNo,
            expiryDate: expiryDate.toDateString(),
            itemText
          });

          console.log("✅ Sent to", phone);

        } catch (err) {

          console.error("❌ Failed for", phone, err.message);

        }

      })
    );

    await Promise.all(jobs);

    res.json({
      success: true,
      message: "Quotation template sent successfully",
      quotationId: quotation._id,
      batchNo,
      expiryDate
    });

  } catch (error) {

    console.error("Quotation WhatsApp Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to send quotation"
    });

  }
};


exports.getGroupedApprovedReplies = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 15;
    const skip = (page - 1) * limit;

    const pipeline = [

      { $match: { status: { $in: ["Approved", "Received", "Expired"] } } },

      {
        $lookup: {
          from: "suppliersdetails",
          localField: "supplierId",
          foreignField: "_id",
          as: "supplier"
        }
      },
      { $unwind: "$supplier" },

      {
        $lookup: {
          from: "quotations",
          localField: "requisitionId",
          foreignField: "requisitionId",
          as: "quotation"
        }
      },
      { $unwind: "$quotation" },

      {
        $addFields: {
          matchedItem: {
            $first: {
              $filter: {
                input: "$quotation.items",
                as: "i",
                cond: { $eq: ["$$i.partNo", "$partNo"] }
              }
            }
          }
        }
      },

      { $sort: { approvedAt: -1, receivedAt: -1 } },

      // ✅ UNIQUE GROUPING — NO MORE DUPLICATES
      {
        $group: {
          _id: "$partNo",
          description: { $first: "$matchedItem.description" },

          approved: {
            $addToSet: {
              $cond: [
                { $eq: ["$status", "Approved"] },
                {
                  supplierId: "$supplierId",
                  rate: "$rate",
                  unit: "$unit",
                  supplierName: "$supplier.name",
                  expiryDate: "$expiryDate",
                  approvedAt: "$approvedAt",
                  source: "$source"
                },
                "$$REMOVE"
              ]
            }
          },

          newQuotes: {
            $addToSet: {
              $cond: [
                { $eq: ["$status", "Received"] },
                {
                  supplierId: "$supplierId",
                  rate: "$rate",
                  unit: "$unit",
                  supplierName: "$supplier.name",
                  receivedAt: "$receivedAt",
                  source: "$source"
                },
                "$$REMOVE"
              ]
            }
          },

          expired: {
            $addToSet: {
              $cond: [
                { $eq: ["$status", "Expired"] },
                {
                  supplierId: "$supplierId",
                  rate: "$rate",
                  unit: "$unit",
                  supplierName: "$supplier.name",
                  expiryDate: "$expiryDate",
                  expiredAt: "$approvedAt",
                  source: "$source"
                },
                "$$REMOVE"
              ]
            }
          }
        }
      },

      {
        $addFields: {
          approved: { $sortArray: { input: "$approved", sortBy: { rate: 1 } } },
          newQuotes: { $sortArray: { input: "$newQuotes", sortBy: { rate: 1 } } }
        }
      },

      {
        $project: {
          partNo: "$_id",
          description: 1,
          approved: 1,
          newQuotes: 1,
          expired: { $slice: ["$expired", 3] }
        }
      },

      { $sort: { partNo: 1 } },

      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          total: [{ $count: "count" }]
        }
      }
    ];

    const result = await QuotationReply.aggregate(pipeline);

    res.json({
      success: true,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil((result[0].total[0]?.count || 0) / limit),
        totalRecords: result[0].total[0]?.count || 0
      },
      data: result[0].data
    });

  } catch (err) {
    console.error("Aggregation error:", err);
    res.status(500).json({ success: false });
  }
};



exports.getGroupedApprovedReplies1 = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 15;
    const skip = (page - 1) * limit;

    const pipeline = [

      // ✅ Only required statuses
      {
        $match: { status: { $in: ["Approved", "Received", "Expired"] } }
      },

      // ✅ Supplier lookup
      {
        $lookup: {
          from: "suppliersdetails",
          localField: "supplierId",
          foreignField: "_id",
          as: "supplier"
        }
      },
      { $unwind: "$supplier" },

      // ✅ Quotation lookup
      {
        $lookup: {
          from: "quotations",
          localField: "requisitionId",
          foreignField: "requisitionId",
          as: "quotation"
        }
      },
      { $unwind: "$quotation" },

      // ✅ Match part description
      {
        $addFields: {
          matchedItem: {
            $first: {
              $filter: {
                input: "$quotation.items",
                as: "i",
                cond: { $eq: ["$$i.partNo", "$partNo"] }
              }
            }
          }
        }
      },

      // ✅ Latest first (important for dedupe)
      { $sort: { approvedAt: -1, receivedAt: -1 } },

      // =====================================================
      // 🔥 DEDUPE MANUAL + WHATSAPP + ANY DUPLICATES HERE
      // =====================================================
      {
        $group: {
          _id: {
            partNo: "$partNo",
            supplierId: "$supplierId",
            status: "$status",
            rate: "$rate",
            unit: "$unit",
            source: "$source"
          },
          doc: { $first: "$$ROOT" }   // keeps latest
        }
      },
      { $replaceRoot: { newRoot: "$doc" } },

      // =====================================================
      // ✅ FINAL GROUP BY PART NUMBER
      // =====================================================
      {
        $group: {
          _id: "$partNo",

          description: { $first: "$matchedItem.description" },

          approved: {
            $push: {
              $cond: [
                { $eq: ["$status", "Approved"] },
                {
                  supplierId: "$supplierId",
                  rate: "$rate",
                  unit: "$unit",
                  supplierName: "$supplier.name",
                  expiryDate: "$expiryDate",
                  approvedAt: "$approvedAt",
                  source: "$source"
                },
                "$$REMOVE"
              ]
            }
          },

          newQuotes: {
            $push: {
              $cond: [
                { $eq: ["$status", "Received"] },
                {
                  supplierId: "$supplierId",
                  rate: "$rate",
                  unit: "$unit",
                  supplierName: "$supplier.name",
                  receivedAt: "$receivedAt",
                  source: "$source"
                },
                "$$REMOVE"
              ]
            }
          },

          expired: {
            $push: {
              $cond: [
                { $eq: ["$status", "Expired"] },
                {
                  supplierId: "$supplierId",
                  rate: "$rate",
                  unit: "$unit",
                  supplierName: "$supplier.name",
                  expiryDate: "$expiryDate",
                  expiredAt: "$approvedAt",
                  source: "$source"
                },
                "$$REMOVE"
              ]
            }
          }
        }
      },

      // ✅ Clean output
      {
        $project: {
          partNo: "$_id",
          description: 1,
          approved: { $arrayElemAt: ["$approved", 0] },
          newQuotes: 1,
          expired: { $slice: ["$expired", 3] }
        }
      },

      { $sort: { partNo: 1 } },

      // ✅ Pagination
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          total: [{ $count: "count" }]
        }
      }
    ];

    const result = await QuotationReply.aggregate(pipeline);

    const rows = result[0].data;
    const total = result[0].total[0]?.count || 0;

    res.json({
      success: true,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        totalRecords: total
      },
      data: rows
    });

  } catch (err) {
    console.error("Aggregation error:", err);
    res.status(500).json({ success: false });
  }
};




exports.approveGroupedQuote = async (req, res) => {
  try {
    const { partNo, supplierId, expiryDate } = req.body;

    const approved = await QuotationReply.findOneAndUpdate(
      { partNo, supplierId, status: "Received" },
      {
        $set: {
          status: "Approved",
          expiryDate: new Date(expiryDate),
          approvedAt: new Date(),
          approvedBy: req.user._id
        }
      },
      { new: true }
    );

    if (!approved) {
      return res.status(404).json({ success: false });
    }

    // ✅ Push into Rate Master
    await SupplierRateMaster.create({
      partNo,
      supplierId,
      rate: approved.rate,
      unit: approved.unit,
      validFrom: new Date(),
      validTo: approved.expiryDate
    });

    // log
    await QuotationApprovalLog.create({
      partNo,
      supplierId,
      rate: approved.rate,
      unit: approved.unit,
      action: "Approved",
      expiryDate: approved.expiryDate,
      actionBy: req.user._id
    });

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ success: false });
  }
};



exports.approveGroupedQuote11 = async (req, res) => {
  try {
    const { partNo, supplierId, expiryDate } = req.body;

    if (!partNo || !supplierId || !expiryDate) {
      return res.status(400).json({
        success: false,
        message: "Missing approval fields"
      });
    }

    /* 🔴 Expire ALL old approved for this part */
    const oldApproved = await QuotationReply.find({
      partNo,
      status: "Approved"
    });

    if (oldApproved.length) {
      await QuotationReply.updateMany(
        { partNo, status: "Approved" },
        { $set: { status: "Expired" } }
      );

      // log expiry
      await QuotationApprovalLog.insertMany(
        oldApproved.map(o => ({
          partNo,
          supplierId: o.supplierId,
          rate: o.rate,
          unit: o.unit,
          action: "Expired",
          expiryDate: o.expiryDate,
          actionBy: req.user._id
        }))
      );
    }

    /* 🟢 Approve selected quote ONLY */
    const approved = await QuotationReply.findOneAndUpdate(
      {
        partNo,
        supplierId,
        status: "Received"   // 🔥 VERY IMPORTANT
      },
      {
        $set: {
          status: "Approved",
          expiryDate: new Date(expiryDate),
          approvedAt: new Date(),
          approvedBy: req.user._id
        }
      },
      { new: true }
    );

    if (!approved) {
      return res.status(404).json({
        success: false,
        message: "Quote not found or already approved"
      });
    }

    // log approval
    await QuotationApprovalLog.create({
      partNo,
      supplierId,
      rate: approved.rate,
      unit: approved.unit,
      action: "Approved",
      expiryDate: approved.expiryDate,
      actionBy: req.user._id
    });

    res.json({
      success: true,
      message: "Quote approved & previous expired",
      approved
    });

  } catch (err) {
    console.error("Approval error:", err);
    res.status(500).json({
      success: false,
      message: "Approval failed"
    });
  }
};

exports.approveGroupedQuoteBulk = async (req, res) => {
  try {
    const { approvals } = req.body;

    if (!Array.isArray(approvals) || !approvals.length) {
      return res.status(400).json({
        success: false,
        message: "No approvals provided"
      });
    }

    for (const item of approvals) {

      const { partNo, supplierId, expiryDate } = item;
      if (!partNo || !supplierId || !expiryDate) continue;

      // =====================================================
      // 🔴 EXPIRE OLD ACTIVE RATE + OLD APPROVED QUOTE
      // =====================================================
      const oldActive = await SupplierRateMaster.findOne({
        partNo,
        supplierId,
        status: "Active"
      });

      if (oldActive) {

        // 🔴 Expire Rate Master
        await SupplierRateMaster.updateOne(
          { _id: oldActive._id },
          {
            $set: {
              status: "Expired",
              validTo: new Date()
            }
          }
        );

        // 🔴 Expire OLD approved quotation reply also
        await QuotationReply.updateOne(
          {
            partNo,
            supplierId,
            status: "Approved"
          },
          {
            $set: {
              status: "Expired"
            }
          }
        );

        // 📜 ERP expiry log
        await QuotationApprovalLog.create({
          partNo,
          supplierId,
          rate: oldActive.rate,
          unit: oldActive.unit,
          source: oldActive.source,
          expiryDate: new Date(),
          action: "Expired",
          previousStatus: "Active",
          newStatus: "Expired",
          actionBy: req.user._id
        });
      }

      // =====================================================
      // 🔍 Fetch latest received quote
      // =====================================================
      const receivedQuote = await QuotationReply.findOne({
        partNo,
        supplierId,
        status: "Received"
      }).sort({ receivedAt: -1 });

      if (!receivedQuote) continue;

      // =====================================================
      // 📦 Fetch description snapshot
      // =====================================================
      const quotation = await Quotation.findOne({
        requisitionId: receivedQuote.requisitionId
      });

      let description = "";
      if (quotation?.items?.length) {
        const matched = quotation.items.find(i => i.partNo === partNo);
        description = matched?.description || "";
      }

      // =====================================================
      // 🟢 Approve new reply
      // =====================================================
      await QuotationReply.updateOne(
        { _id: receivedQuote._id },
        {
          $set: {
            status: "Approved",
            expiryDate: new Date(expiryDate),
            approvedAt: new Date(),
            approvedBy: req.user._id
          }
        }
      );

      // =====================================================
      // 🟢 Insert NEW ACTIVE rate
      // =====================================================
      await SupplierRateMaster.create({
        partNo,
        description,
        supplierId,
        rate: receivedQuote.rate,
        unit: receivedQuote.unit,
        source: receivedQuote.source,
        validFrom: new Date(),
        validTo: new Date(expiryDate),
        status: "Active"
      });

      // =====================================================
      // 📜 ERP approval log
      // =====================================================
      await QuotationApprovalLog.create({
        partNo,
        supplierId,
        rate: receivedQuote.rate,
        unit: receivedQuote.unit,
        source: receivedQuote.source,
        expiryDate: new Date(expiryDate),
        action: "Approved",
        previousStatus: "Received",
        newStatus: "Active",
        actionBy: req.user._id
      });
    }

    res.json({
      success: true,
      message: "Rates approved successfully and previous rates expired"
    });

  } catch (err) {
    console.error("Bulk approval error:", err);
    res.status(500).json({
      success: false,
      message: "Bulk approval failed"
    });
  }
};



exports.approveGroupedQuoteBulk1 = async (req, res) => {
  try {
    const { approvals } = req.body;

    if (!Array.isArray(approvals) || !approvals.length) {
      return res.status(400).json({
        success: false,
        message: "No approvals provided"
      });
    }

    for (const item of approvals) {

      const { partNo, supplierId, expiryDate } = item;

      if (!partNo || !supplierId || !expiryDate) continue;

      // 🔴 expire old approved
      const oldApproved = await QuotationReply.find({
        partNo,
        status: "Approved"
      });

      if (oldApproved.length) {
        await QuotationReply.updateMany(
          { partNo, status: "Approved" },
          { $set: { status: "Expired" } }
        );

        await QuotationApprovalLog.insertMany(
          oldApproved.map(o => ({
            partNo,
            supplierId: o.supplierId,
            rate: o.rate,
            unit: o.unit,
            action: "Expired",
            expiryDate: o.expiryDate,
            actionBy: req.user._id
          }))
        );
      }

      // 🟢 approve selected
      const approved = await QuotationReply.findOneAndUpdate(
        {
          partNo,
          supplierId,
          status: "Received"
        },
        {
          $set: {
            status: "Approved",
            expiryDate: new Date(expiryDate),
            approvedAt: new Date(),
            approvedBy: req.user._id
          }
        },
        { new: true }
      );

      if (approved) {
        await QuotationApprovalLog.create({
          partNo,
          supplierId,
          rate: approved.rate,
          unit: approved.unit,
          action: "Approved",
          expiryDate: approved.expiryDate,
          actionBy: req.user._id
        });
      }
    }

    res.json({
      success: true,
      message: "Bulk approval completed"
    });

  } catch (err) {
    console.error("Bulk approval error:", err);
    res.status(500).json({
      success: false,
      message: "Bulk approval failed"
    });
  }
};



exports.getLogsByPartNo = async (req, res) => {
  try {
    const { partNo } = req.params;

    const logs = await QuotationApprovalLog.find({ partNo })
      .populate("supplierId", "name")
      .populate("actionBy", "name")
      .sort({ actionAt: -1 }); // 👈 LATEST FIRST

    res.status(200).json({
      success: true,
      count: logs.length,
      data: logs
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};






exports.getRepliesByStatus = async (req, res) => {
  try {
    const { status, batchNo, requisitionId } = req.query;

    const filter = {};

    // ✅ status from frontend
    if (status) {
      filter.status = status; // Pending | Received | Approved
    }

    if (batchNo) {
      filter.batchNo = Number(batchNo);
    }

    if (requisitionId) {
      filter.requisitionId = requisitionId;
    }

    const replies = await QuotationReply.find(filter)
      .populate("supplierId", "name mobileNo")
      .populate("approvedBy", "name")
      .sort({ receivedAt: -1 });

    res.status(200).json({
      success: true,
      count: replies.length,
      data: replies
    });

  } catch (err) {
    console.error("Quotation Reply Fetch Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch quotation replies"
    });
  }
};


exports.addManualQuotationRate = async (req, res) => {
  try {
    const {
      requisitionNo,
      items,
      suppliers,
      replies
    } = req.body;

    if (!items?.length || !suppliers?.length || !replies?.length) {
      return res.status(400).json({ success: false, message: "Missing data" });
    }

    // 🔥 Resolve requisitionId from requisitionNo
    const requisition = await Request.findOne({ requisitionNo });

    if (!requisition) {
      return res.status(404).json({
        success: false,
        message: "Requisition not found"
      });
    }

    const requisitionId = requisition._id;

    // ===============================
    // 1️⃣ CREATE QUOTATION LOG
    // ===============================
    const lastBatch = await Quotation.findOne({ requisitionId }).sort({ batchNo: -1 });
    const batchNo = lastBatch ? lastBatch.batchNo + 1 : 1;

    // ⏳ Same ERP rule as WhatsApp (7 days validity)
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 7);

    const quotation = await Quotation.create({
      requisitionId,
      requisitionNo,
      batchNo,
      expiryDate,
      items,
      suppliers: suppliers.map(s => ({
        supplierId: s.supplierId,
        supplierName: s.name,
        phone: s.phone || "",
        status: "Replied",
        repliedAt: new Date()
      })),
      status: "Completed",
      createdBy: req.user._id
    });

    // ===============================
    // 2️⃣ SAVE ALL REPLIES (WITH REVISION FIX)
    // ===============================
    for (const r of replies) {

      // 🔎 Get last revision for same part + supplier + batch
      const lastRevision = await QuotationReply.findOne({
        requisitionId,
        supplierId: r.supplierId,
        batchNo,
        partNo: r.partNo
      }).sort({ revision: -1 });

      const revision = lastRevision ? lastRevision.revision + 1 : 1;

      await QuotationReply.create({
        requisitionId,
        supplierId: r.supplierId,
        batchNo,
        partNo: r.partNo,
        revision,                // ✅ FIXED
        unit: r.unit,
        rate: r.rate,
        status: "Received",
        source: "Manual",
        receivedAt: new Date()
      });
    }

    return res.json({
      success: true,
      message: "Manual quotation logged & captured successfully",
      batchNo,
      expiryDate
    });

  } catch (err) {
    console.error("Manual quotation error:", err);
    res.status(500).json({ success: false });
  }
};


exports.forceExpireRate = async (req, res) => {
  try {
    const { partNo, supplierId } = req.body;

    if (!partNo || !supplierId) {
      return res.status(400).json({
        success: false,
        message: "partNo and supplierId required"
      });
    }

    // 🔍 latest approved quote
    const approvedQuote = await QuotationReply.findOne({
      partNo,
      supplierId,
      status: "Approved"
    }).sort({ approvedAt: -1 });

    if (!approvedQuote) {
      return res.status(404).json({
        success: false,
        message: "No approved rate found to expire"
      });
    }

    // 🔴 expire quotation reply
    await QuotationReply.updateOne(
      { _id: approvedQuote._id },
      { $set: { status: "Expired" } }
    );

    // 🔴 expire rate master with validTo close
    const rate = await SupplierRateMaster.findOneAndUpdate(
      { partNo, supplierId, status: "Active" },
      {
        $set: {
          status: "Expired",
          validTo: new Date()
        }
      },
      { new: true }
    );

    // 📜 audit log
    if (rate) {
      await QuotationApprovalLog.create({
        partNo,
        supplierId,
        rate: rate.rate,
        unit: rate.unit,
        source: rate.source,
        expiryDate: rate.validTo,
        action: "Expired",
        previousStatus: "Approved",
        newStatus: "Expired",
        actionBy: req.user._id
      });
    }

    res.json({
      success: true,
      message: "Rate expired successfully"
    });

  } catch (err) {
    console.error("Force expire error:", err);
    res.status(500).json({
      success: false,
      message: "Rate expiry failed"
    });
  }
};




exports.reactivateRate = async (req, res) => {
  try {
    const { partNo, supplierId } = req.body;

    if (!partNo || !supplierId) {
      return res.status(400).json({
        success: false,
        message: "Missing partNo or supplierId"
      });
    }

    // 🔒 block if active exists
    const activeExists = await SupplierRateMaster.findOne({
      partNo,
      supplierId,
      status: "Active"
    });

    if (activeExists) {
      return res.status(400).json({
        success: false,
        message: "Active rate already exists"
      });
    }

    // 🔍 latest expired rate
    const expiredRate = await SupplierRateMaster.findOne({
      partNo,
      supplierId,
      status: "Expired"
    }).sort({ validTo: -1 });

    if (!expiredRate) {
      return res.status(404).json({
        success: false,
        message: "Expired rate not found"
      });
    }

    // ♻ reactivate rate master
    await SupplierRateMaster.updateOne(
      { _id: expiredRate._id },
      {
        $set: {
          status: "Active",
          validTo: null
        }
      }
    );

    // ♻ reactivate quotation reply
    await QuotationReply.updateOne(
      {
        partNo,
        supplierId,
        status: "Expired"
      },
      { $set: { status: "Approved" } }
    );

    // 📜 audit log
    await QuotationApprovalLog.create({
      partNo,
      supplierId,
      rate: expiredRate.rate,
      unit: expiredRate.unit,
      source: expiredRate.source,
      expiryDate: expiredRate.validTo,
      action: "Reactivated",
      previousStatus: "Expired",
      newStatus: "Active",
      actionBy: req.user._id
    });

    res.json({
      success: true,
      message: "Rate reactivated successfully"
    });

  } catch (err) {
    console.error("Reactivate error:", err);
    res.status(500).json({
      success: false,
      message: "Rate reactivation failed"
    });
  }
};







